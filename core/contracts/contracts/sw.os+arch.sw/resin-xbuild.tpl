RUN curl -SLO "{{sw.blob.resin-xbuild.assets.bin.url}}" \
  && echo "{{sw.blob.resin-xbuild.assets.bin.checksum}}  {{sw.blob.resin-xbuild.assets.bin.name}}" | sha256sum -c - \
  && tar -xzf "{{sw.blob.resin-xbuild.assets.bin.name}}" \
  && rm "{{sw.blob.resin-xbuild.assets.bin.name}}" \
  && chmod +x {{sw.blob.resin-xbuild.assets.bin.main}} \
  && mv {{sw.blob.resin-xbuild.assets.bin.main}} /usr/bin \
  && ln -s {{sw.blob.resin-xbuild.assets.bin.main}} /usr/bin/cross-build-start \
  && ln -s {{sw.blob.resin-xbuild.assets.bin.main}} /usr/bin/cross-build-end
