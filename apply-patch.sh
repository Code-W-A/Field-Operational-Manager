#!/bin/bash

# Navigate to the problematic package
cd node_modules/.pnpm/@radix-ui+react-use-effect-event@0.0.0_@types+react@19.0.0_react@19.0.0/node_modules/@radix-ui/react-use-effect-event/dist

# Backup the original file
cp index.mjs index.mjs.backup

# Replace the content with our fixed version
cat > index.mjs << 'EOL'
import * as React from 'react';

// Replacement for useEffectEvent using useCallback
const useEffectEvent = (callback) => {
  const callbackRef = React.useRef(callback);
  
  React.useEffect(() => {
    callbackRef.current = callback;
  });
  
  return React.useCallback((...args) => {
    return callbackRef.current?.(...args);
  }, []);
};

export { useEffectEvent };
EOL

echo "Patch applied successfully!"

# Create the patches directory if it doesn't exist
mkdir -p ../../../../../../../../patches

# Create a patch file using diff
diff -u index.mjs.backup index.mjs > ../../../../../../../../patches/@radix-ui+react-use-effect-event@0.0.0.patch

echo "Patch file created!"
