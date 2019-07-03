RUN echo "deb http://{{sw.os.slug}}.beagleboard.org/packages wheezy-bbb main" >> /etc/apt/sources.list \
	&& echo "deb [arch=armhf] http://repos.rcn-ee.net/{{sw.os.slug}}/ {{sw.os.version}} main" >> /etc/apt/sources.list \
	&& apt-key adv --keyserver keyserver.ubuntu.com --recv-key B2710B8359890110 \
	&& apt-key adv --keyserver keyserver.ubuntu.com --recv-key D284E608A4C46402
