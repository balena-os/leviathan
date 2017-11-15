# Pull base image
FROM node:boron

# Set environment variables
ENV INITSYSTEM on

# Define container's working directory
WORKDIR /usr/app

# Copy files to container's working directory
COPY . /usr/app

# Install dependencies
RUN npm install
