#!/bin/bash
echo "⏬ Downloading Bible databases..."
mkdir -p databases
curl -L https://github.com/aaronjohnsabu1999/bible-databases/archive/refs/heads/main.zip -o /tmp/bible.zip
unzip -q /tmp/bible.zip -d /tmp
cp /tmp/bible-databases-main/DB/*.db databases/
echo "✅ Bible databases copied to ./databases/"
