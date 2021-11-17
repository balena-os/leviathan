#!/bin/bash

# cleanup old socket
rm -f /run/leviathan/worker.sock

npm start
