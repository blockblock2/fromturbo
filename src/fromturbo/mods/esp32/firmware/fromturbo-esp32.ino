// fromturbo ESP32 firmware (Arduino)
//
// Lets fromturbo's ESP32 blocks control this board over USB or Bluetooth.
//
// 1. Arduino IDE -> Boards Manager -> install "esp32 by Espressif Systems".
// 2. Pick your board (e.g. "ESP32 Dev Module") and its port, then Upload.
// 3. In fromturbo: add the ESP32 extension and click "Connect".
//
// Your own code: edit onMessage() below. Anything sent with the
// "send [ ] to ESP32" block arrives there, and sendToScratch("text")
// fires the "when ESP32 sends" hats in your project.
//
// Works with ESP32, ESP32-S2, S3, C3 and C6 boards. Bluetooth is skipped
// automatically on boards that don't have it (ESP32-S2).

#include <Arduino.h>
#include <driver/gpio.h>

#define FT_VERSION "1"
#define FT_BAUD 115200
#define FT_BLE_NAME "fromturbo ESP32"

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

#if defined(CONFIG_BT_ENABLED) && defined(CONFIG_BLUEDROID_ENABLED)
#define FT_HAS_BLE 1
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#else
#define FT_HAS_BLE 0
#endif

#if defined(SOC_TOUCH_SENSOR_SUPPORTED) || (defined(SOC_TOUCH_SENSOR_NUM) && SOC_TOUCH_SENSOR_NUM > 0)
#define FT_HAS_TOUCH 1
#else
#define FT_HAS_TOUCH 0
#endif

void sendToScratch(const String &text);

// ---------- your code ----------

// Called with the text from the "send [ ] to ESP32" block.
void onMessage(const String &text) {
  if (text == "ping") {
    sendToScratch("pong");
  }
}

// ---------- everything below makes the blocks work ----------

const int MAX_PIN = 48;
enum PinMode { PM_UNKNOWN, PM_OUT, PM_IN, PM_PULLUP, PM_PWM, PM_SERVO };
PinMode pinModes[MAX_PIN + 1];
bool watched[MAX_PIN + 1];
int lastWatched[MAX_PIN + 1];
unsigned long lastWatchCheck = 0;

String serialLine;
String bleLine;

#if FT_HAS_BLE
#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
BLECharacteristic *txChar = nullptr;
volatile bool bleConnected = false;
portMUX_TYPE bleMux = portMUX_INITIALIZER_UNLOCKED;
String bleIncoming;  // filled from the Bluetooth task, emptied in loop()

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override { bleConnected = true; }
  void onDisconnect(BLEServer *server) override {
    bleConnected = false;
    BLEDevice::startAdvertising();
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    auto value = c->getValue();  // std::string on core 2.x, String on 3.x
    portENTER_CRITICAL(&bleMux);
    for (size_t i = 0; i < value.length(); i++) bleIncoming += (char)value[i];
    portEXIT_CRITICAL(&bleMux);
  }
};

void startBle() {
  BLEDevice::init(FT_BLE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(NUS_SERVICE);
  txChar = service->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic *rx = service->createCharacteristic(
      NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  service->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);  // the name goes in the scan response; it won't fit next to the UUID
  BLEDevice::startAdvertising();
}
#endif

// Every reply goes out over USB, and over Bluetooth too when something is connected.
void sendLine(const String &line) {
  Serial.print(line);
  Serial.print('\n');
#if FT_HAS_BLE
  if (bleConnected && txChar) {
    String out = line + "\n";
    for (size_t i = 0; i < out.length(); i += 20) {
      String part = out.substring(i, i + 20);
      txChar->setValue((uint8_t *)part.c_str(), part.length());
      txChar->notify();
      delay(4);
    }
  }
#endif
}

void sendToScratch(const String &text) {
  sendLine("m " + text);
}

bool validPin(int pin) {
  return pin >= 0 && pin <= MAX_PIN && GPIO_IS_VALID_GPIO(pin);
}

void ensureMode(int pin, PinMode wanted) {
  if (pinModes[pin] == wanted) return;
  if (wanted == PM_OUT) pinMode(pin, OUTPUT);
  else if (wanted == PM_IN) pinMode(pin, INPUT);
  else if (wanted == PM_PULLUP) pinMode(pin, INPUT_PULLUP);
  pinModes[pin] = wanted;
}

// Reading a pin that was never set up makes it a plain input.
void ensureReadable(int pin) {
  PinMode m = pinModes[pin];
  if (m != PM_IN && m != PM_PULLUP && m != PM_OUT) ensureMode(pin, PM_IN);
}

void writeServo(int pin, int angle) {
  angle = constrain(angle, 0, 180);
  // 0-180 degrees -> 500-2500 microsecond pulse every 20 ms, 14-bit duty
  uint32_t pulse = map(angle, 0, 180, 500, 2500);
  uint32_t duty = pulse * 16383UL / 20000UL;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  if (pinModes[pin] != PM_SERVO) {
    ledcDetach(pin);
    ledcAttach(pin, 50, 14);
  }
  ledcWrite(pin, duty);
#else
  static int servoChannel[MAX_PIN + 1];
  static int nextChannel = 0;
  if (pinModes[pin] != PM_SERVO) {
    if (servoChannel[pin] == 0) servoChannel[pin] = SOC_LEDC_CHANNEL_NUM - (++nextChannel) + 1;
    ledcSetup(servoChannel[pin] - 1, 50, 14);
    ledcAttachPin(pin, servoChannel[pin] - 1);
  }
  ledcWrite(servoChannel[pin] - 1, duty);
#endif
  pinModes[pin] = PM_SERVO;
}

void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;
  char cmd = line.charAt(0);
  String rest = line.length() > 2 ? line.substring(2) : "";

  if (cmd == 'X') {  // message for onMessage()
    onMessage(rest);
    return;
  }
  if (cmd == '?') {
    sendLine(String("ok fromturbo-esp32 ") + FT_VERSION + " " + CONFIG_IDF_TARGET);
    return;
  }

  int a = 0, b = 0, n = 0;
  n = sscanf(rest.c_str(), "%d %d", &a, &b);

  if (cmd == 'L') {  // L state
    ensureMode(LED_BUILTIN, PM_OUT);
    digitalWrite(LED_BUILTIN, a ? HIGH : LOW);
    return;
  }

  int pin = a;
  if (n < 1 || !validPin(pin)) {
    sendLine("e bad pin " + String(pin));
    return;
  }

  switch (cmd) {
    case 'M':  // M pin mode   (1 output, 2 input, 3 input pull-up)
      if (b == 1) ensureMode(pin, PM_OUT);
      else if (b == 3) ensureMode(pin, PM_PULLUP);
      else ensureMode(pin, PM_IN);
      break;
    case 'D':  // D pin 0|1
      ensureMode(pin, PM_OUT);
      digitalWrite(pin, b ? HIGH : LOW);
      break;
    case 'R':  // R pin id -> r id value
      ensureReadable(pin);
      sendLine("r " + String(b) + " " + String(digitalRead(pin)));
      break;
    case 'A':  // A pin id -> r id 0..4095
      pinModes[pin] = PM_UNKNOWN;
      sendLine("r " + String(b) + " " + String(analogRead(pin)));
      break;
    case 'P':  // P pin 0..255
      pinModes[pin] = PM_PWM;
      analogWrite(pin, constrain(b, 0, 255));
      break;
    case 'S':  // S pin angle
      writeServo(pin, b);
      break;
    case 'T':  // T pin id -> r id value (-1 if this chip has no touch pins)
#if FT_HAS_TOUCH
      sendLine("r " + String(b) + " " + String((long)touchRead(pin)));
#else
      sendLine("r " + String(b) + " -1");
#endif
      break;
    case 'W':  // W pin -> c pin value now and on every change
      ensureReadable(pin);
      watched[pin] = true;
      lastWatched[pin] = digitalRead(pin);
      sendLine("c " + String(pin) + " " + String(lastWatched[pin]));
      break;
    case 'U':  // U pin -> stop watching
      watched[pin] = false;
      break;
    default:
      sendLine(String("e unknown command ") + cmd);
  }
}

void readInto(String &buffer, char c) {
  if (c == '\n' || c == '\r') {
    if (buffer.length()) handleLine(buffer);
    buffer = "";
  } else if (buffer.length() < 240) {
    buffer += c;
  }
}

void setup() {
  Serial.begin(FT_BAUD);
  for (int i = 0; i <= MAX_PIN; i++) {
    pinModes[i] = PM_UNKNOWN;
    watched[i] = false;
  }
#if FT_HAS_BLE
  startBle();
#endif
  delay(50);
  sendLine(String("ready fromturbo-esp32 ") + FT_VERSION + " " + CONFIG_IDF_TARGET);
}

void loop() {
  while (Serial.available()) readInto(serialLine, (char)Serial.read());

#if FT_HAS_BLE
  if (bleIncoming.length()) {
    portENTER_CRITICAL(&bleMux);
    String chunk = bleIncoming;
    bleIncoming = "";
    portEXIT_CRITICAL(&bleMux);
    for (size_t i = 0; i < chunk.length(); i++) readInto(bleLine, chunk.charAt(i));
  }
#endif

  // Report watched pins that changed (checked every 15 ms, which also smooths out button bounce)
  if (millis() - lastWatchCheck >= 15) {
    lastWatchCheck = millis();
    for (int pin = 0; pin <= MAX_PIN; pin++) {
      if (!watched[pin]) continue;
      int v = digitalRead(pin);
      if (v != lastWatched[pin]) {
        lastWatched[pin] = v;
        sendLine("c " + String(pin) + " " + String(v));
      }
    }
  }
  delay(1);
}
