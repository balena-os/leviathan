RUN echo "deb http://archive.raspbian.org/raspbian {{sw.os.version}} main contrib non-free rpi firmware" >>  /etc/apt/sources.list \
	&& apt-key adv --keyserver pgp.mit.edu  --recv-key 0x9165938D90FDDD2E
