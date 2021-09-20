function parseLink(text) {
  if (text.indexOf('://') !== -1) {
    const url = new URL(text);
    let type;
    let id;
    let service;

    [, type, id] = url.pathname.split('/');

    switch (url.host) {
      case 'itunes.apple.com':
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

    return null;
  }
}

async function saoirse(link) {
  const { service, type, id } = parseLink(link);

  const response = await fetch(`https://api.saoir.se/${type}/${service}/${id}`);

  return response.json();
}

async function handleEvent(event) {
  console.log(handleEvent, event);

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

  const dataFetches = await Promise.all(validLinks.map(async link => {
    const data = await saoirse(link);

    return { link, data };
  }));

  const unfurls = dataFetches.map(({ link, data }, i) => {
    const [, mediaType] = link.split('://')[1].split('/');
    const {
      name,
      artist,
      spotify_id,
      tidal_id,
      deezer_id,
      itunes_id
    } = data;

    const spotifyUrl = `<https://play.spotify.com/${mediaType}/${spotify_id}?play=true|Play on Spotify>`;
    const tidalUrl = `<https://listen.tidal.com/${mediaType}/${tidal_id}?play=true|Play on TIDAL>`;
    const deezerUrl = `<https://www.deezer.com/${mediaType}/${deezer_id}|Play on Deezer>`;

    const text = [
      spotifyUrl,
      tidalUrl,
      deezerUrl
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
    'channel': req.body.event.channel,
    'ts': req.body.event.message_ts,
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
  console.log(request);

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
