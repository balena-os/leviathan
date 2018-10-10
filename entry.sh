#!/bin/bash

function start_udev() {
  udevd --daemon &> /dev/null
  udevadm trigger &> /dev/null
  udevadm settle &> /dev/null
}

start_udev
npm start
