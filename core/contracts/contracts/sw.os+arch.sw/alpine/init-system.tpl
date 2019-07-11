# Config OpenRC
RUN sed -i '/tty/d' /etc/inittab

# rc.conf
RUN echo $'# Global OpenRC configuration settings\n\
# Ref: https://github.com/OpenRC/openrc/tree/master/etc\n\
rc_env_allow=*\n\
rc_crashed_stop=NO\n\
rc_crashed_start=YES\n\
rc_provide="loopback net"\n\
rc_sys="lxc"\n\
rc_tty_number=12' > /etc/rc.conf

# resin init script
RUN echo $'#!/sbin/openrc-run\n\
\n\
description="Resin.io User Application"\n\
pid_file=/var/run/resinapp.pid\n\
waiting_time=1000\n\
\n\
start() {\n\
	ebegin "Starting Resin.io User Application"\n\
	start-stop-daemon --start --exec /etc/resinApp.sh \\\n\
	--chdir #{DIR} \\\n\
	--make-pidfile --pidfile "$pid_file" --background \\\n\
	--stdout /dev/console \\\n\
	--stderr /dev/console \\\n\
	--wait "$waiting_time" \\\n\
	eend $?\n\
}\n\
\n\
stop() {\n\
	ebegin "Stopping Resin.io User Application"\n\
	start-stop-daemon --stop --exec /etc/resinApp.sh --pidfile $pid_file --wait "$waiting_time"\n\
	eend $?\n\
}' > /etc/init.d/resin

RUN chmod +x /etc/init.d/resin

RUN rc-update add resin default \
	&& rc-update add dbus default

COPY entry.sh /usr/bin/entry.sh

ENTRYPOINT ["/usr/bin/entry.sh"]
