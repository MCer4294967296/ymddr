#!/bin/bash
echo "Session has been running for 60 minutes. Triggering 60-min action."
# Add your custom logic here
npx tsx ./src/memory/memoryMaster.ts "$1" "$2"
