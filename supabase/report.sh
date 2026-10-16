#!/bin/bash
# Repeats a step's output as one GitHub annotation, so it can be read through GitHub's API (the run page shows it
# too). Only for output that's already fine to show in the public logs.
title=$1; file=$2
[ -s "$file" ] || exit 0
msg=$(grep -v '^\s*$' "$file" | tail -60 | sed 's/%/%25/g; s/\r//g' | awk '{printf "%s%%0A", $0}')
echo "::notice title=${title}::${msg}"
