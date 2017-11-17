# Pull base image
FROM node:boron

# Install qemu dependencies
RUN apt-get update && apt-get install -y qemu-system-x86 qemu-kvm && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV INITSYSTEM on

# Define container's working directory
WORKDIR /usr/app

# Copy files to container's working directory
COPY . /usr/app

# Install dependencies
RUN npm install
