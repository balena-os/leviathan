ENV TINI_VERSION {{sw.blob.tini.version}}
RUN curl -SLO "{{sw.blob.tini.assets.bin.url}}" \
  && echo "{{sw.blob.tini.assets.bin.checksum}}  {{sw.blob.tini.assets.bin.name}}" | sha256sum -c - \
  && tar -xzf "{{sw.blob.tini.assets.bin.name}}" \
  && rm "{{sw.blob.tini.assets.bin.name}}" \
  && chmod +x {{sw.blob.tini.assets.bin.main}} \
  && mv {{sw.blob.tini.assets.bin.main}} /sbin/{{sw.blob.tini.assets.bin.main}}
