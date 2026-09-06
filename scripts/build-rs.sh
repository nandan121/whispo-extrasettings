#!/bin/bash

mkdir -p resources/bin

cd whispo-rs

cargo build -r

# Cargo emits whispo-rs on Unix and whispo-rs.exe on Windows: copy whichever
# was produced (keyboard.ts resolves the .exe name on non-mac platforms).
if [ -f target/release/whispo-rs ]; then
  cp target/release/whispo-rs ../resources/bin/whispo-rs
fi
if [ -f target/release/whispo-rs.exe ]; then
  cp target/release/whispo-rs.exe ../resources/bin/whispo-rs.exe
fi
