// Example custom extension in the standard Scratch custom extension format.
// Add it: Mods → "Add a custom extension" → https://fromturbo.pages.dev/mods/example-extension.js
// (Choose "Run without sandbox" when asked if you want it to reach the editor.)

(function (Scratch) {
    'use strict';

    class FromturboExample {
        getInfo () {
            return {
                id: 'fromturboexample',
                name: 'fromturbo Example',
                color1: '#ff8c1a',
                blocks: [
                    {
                        opcode: 'shout',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'shout [TEXT]',
                        arguments: {
                            TEXT: {type: Scratch.ArgumentType.STRING, defaultValue: 'hello'}
                        }
                    },
                    {
                        opcode: 'between',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '[N] is between [A] and [B]',
                        arguments: {
                            N: {type: Scratch.ArgumentType.NUMBER, defaultValue: 5},
                            A: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1},
                            B: {type: Scratch.ArgumentType.NUMBER, defaultValue: 10}
                        }
                    }
                ]
            };
        }

        shout ({TEXT}) {
            return `${Scratch.Cast.toString(TEXT).toUpperCase()}!`;
        }

        between ({N, A, B}) {
            const n = Scratch.Cast.toNumber(N);
            const lo = Math.min(Scratch.Cast.toNumber(A), Scratch.Cast.toNumber(B));
            const hi = Math.max(Scratch.Cast.toNumber(A), Scratch.Cast.toNumber(B));
            return n >= lo && n <= hi;
        }
    }

    Scratch.extensions.register(new FromturboExample());
})(Scratch);
