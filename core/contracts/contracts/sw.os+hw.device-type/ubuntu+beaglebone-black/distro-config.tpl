RUN echo "deb [arch=armhf] http://repos.rcn-ee.net/{{sw.os.slug}}/ {{sw.os.version}} main" >> /etc/apt/sources.list \
	&& apt-key adv --keyserver keyserver.ubuntu.com --recv-key D284E608A4C46402
