/*
 * external-request.js
 *
 * Copyright (c) 2021 Andrea Cardaci <cyrus.and@gmail.com>
 *
 * Deno port Copyright (C) 2022 by RStudio, PBC
 */

export default async function externalRequest(options) {
  // perform the DNS lookup manually so that the HTTP host header generated by
  // http.get will contain the IP address, this is needed because since Chrome
  // 66 the host header cannot contain an host name different than localhost
  // (see https://github.com/cyrus-and/chrome-remote-interface/issues/340)
  /*if (!options.useHostName) {
        const addresses = await Deno.resolveDns(options.host, "A");
        options = Object.assign({}, options);
        options.host = addresses[0];
    }*/

  const url = `${options.protocol}:/${options.host}:${options.port}${options.path}`;
  const response = await fetch(url);
  const text = await response.text();

  if (response.status !== 200) {
    throw new Error(text);
  }
  return text;
}
