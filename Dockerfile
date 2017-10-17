# Pull base image
FROM node:boron

# Set environment variables
ENV INITSYSTEM on

# Update and install
RUN apt-get update && apt-get install -y --no-install-recommends \
    bc \
 && rm -rf /var/lib/apt/lists/*

# Define container's working directory
WORKDIR /usr/app

# Copy files to container's working directory
COPY . /usr/app

# Install dependencies
RUN npm install
