function parseLink(text) {
  if (text.indexOf('://') !== -1) {
    const url = new URL(text);
    let type;
    let id;
    let service;

    [, type, id] = url.pathname.split('/');

    if (url.pathname.indexOf('/browse/') !== -1) {
      [, , type, id] = url.pathname.split('/');
    }

    switch (url.host) {
      case 'itunes.apple.com':
      case 'music.apple.com':
        type = url.searchParams.get('i') ? 'track' : 'album';
        id = url.searchParams.get('i');
        service = 'itunes';
        break;
      case 'open.spotify.com':
      case 'play.spotify.com':
        service = 'spotify';
        break;
      case 'listen.tidal.com':
      case 'tidal.com':
      case 'www.tidal.com':
        service = 'tidal';
        break;
      case 'deezer.com':
      case 'www.deezer.com':
        service = 'deezer';
        break;
      default: break;
    }

    if (type && id && service) {
      return { service, id, type };
    }
  }

  return { service: null, id: null, type: null };
}

async function saoirse(link) {
  const { service, type, id } = parseLink(link);

  if (service === null || type === null || id === null) {
    throw new Error('Could not find song');
  }

  const url = `https://api.saoir.se/${type}/${service}/${id}`;
  const response = await fetch(url);
  const data = await response.json();

  return { link, type, data };
}

async function handleEvent(event) {
  const links = event.links.map(({ url }) => url);
  const supportedDomains = [
    'tidal.com',
    'spotify.com',
    'itunes.com',
    'deezer.com'
  ];

  const validLinks = links.filter(link => {
    return supportedDomains
      .map(domain => link.indexOf(domain) !== -1)
      .filter(Boolean)
      .length > 0;
  });

  const dataFetches = await Promise.all(validLinks.map(saoirse));

  const unfurls = dataFetches.map(({ link, data, type }, i) => {
    const {
      name,
      artist,
      spotify_id,
      tidal_id,
      deezer_id,
      itunes_id
    } = data;

    const spotifyUrl = `<https://open.spotify.com/${type}/${spotify_id}?play=true|Spotify>`;
    const appleMusicUrl = `<https://wt-43e42263dca67ab0063b88edf7ca290e-0.sandbox.auth0-extend.com/apple-music/${type}/${itunes_id}|Apple Music>`;
    const deezerUrl = `<https://www.deezer.com/${type}/${deezer_id}|Deezer>`;
    const tidalUrl = `<https://listen.tidal.com/${type}/${tidal_id}?play=true|TIDAL>`;

    const text = [
      spotifyUrl,
      appleMusicUrl,
      deezerUrl,
      tidalUrl
    ].join(', ');

    return {
      [link]: {
        title: `${name} by ${artist}`,
        text,
        // thumb_url: `https://wt-43e42263dca67ab0063b88edf7ca290e-0.sandbox.auth0-extend.com/spotify-id-image/${spotify_id}`
      }
    };
  }).reduce((a, b) => Object.assign(a, b));

  const body = JSON.stringify({
    'channel': event.channel,
    'ts': event.message_ts,
    'unfurls': unfurls
  });

  const slackBearer = Deno.env.get('SLACK_BEARER');

  await fetch('https://slack.com/api/chat.unfurl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'Bearer ' + slackBearer
    },
    body
  });

  return new Response(null, {
    status: 200
  });
}

async function handleRequest(request) {
  if (request.method === 'POST') {
    const json = await request.json();

    if (json.challenge) {
      return new Response(json.challenge, {
        status: 200
      });
    }

    if (json.event && json.event.type === 'link_shared' && json.event.links) {
      return handleEvent(json.event);
    }
  }

  return new Response(null, {
    status: 500
  });
}

addEventListener('fetch', event => event.respondWith(handleRequest(event.request)));
