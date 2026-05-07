#!/bin/bash
echo "Session ended 10 minutes ago. Triggering 10-min action."
# Add your custom logic here
npx tsx ./src/memory/memoryMaster.ts "$1" "$2"
