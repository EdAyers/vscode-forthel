# SAD Language Client.

This is based on the Haskell Language Server Client, but has been adjusted to work with my modified version of `SAD` instead.
This is very much an experimental prototype at the moment so don't expect in the marketplace any time soon.

## Prereqs

You need to install my special version of SAD which can speak VSCode's LSP.

```sh
git clone https://github.com/EdAyers/SAD3.git
cd SAD3
stack install
# this should put an executable`~/.local/bin/SAD`. If it doesn't then you will need to set the `executablePath` config.
```

## Build

```
npm i
```

I just open this project in vscode and hit F5.

[TODO] Add proper build instructions.

## Behaviour

Open a `ForTheL` file and you should see:
- syntax highlighting
- on save, if it can find SAD, it will run it's parser and let you know what the error messages are.
- 

## TODOs

- Reintroduce the sophisticated executable finder that looks at the value of `which SAD`.
- `SAD` should have a `--version` flag so that this extension can check it has a version compatible with LSP.
