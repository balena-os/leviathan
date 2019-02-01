#!/bin/bash

function start_udev() {
  udevd --daemon &> /dev/null
  udevadm trigger &> /dev/null
  udevadm settle &> /dev/null
}

function start_docker_inside_container() {
  wrapdocker &> /dev/null
}

start_udev
start_docker_inside_container
npm start
