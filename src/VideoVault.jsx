import {useMemo, useRef, useState} from 'react';
import {FaPlay} from 'react-icons/fa6';
import {discoverVideos, videoBuild, videoBuilds, videoFormat} from './video-discovery.js';

export function VideoCards({videos, onPlay, shorts = false}) {
  return <div className={shorts ? 'shorts-strip' : 'film-grid'}>
    {videos.map(video => <article className={shorts ? 'film-card short-card' : 'film-card'} key={video.id}>
      <button className="video-open" onClick={event => onPlay(video, event.currentTarget)} aria-label={`Play ${video.title}`}>
        <div className="film-image">
          <img src={video.image} width="480" height="360" alt="" loading="lazy" decoding="async"/>
          <span className="play"><FaPlay aria-hidden="true"/></span>
          <span className="video-duration">{video.duration}</span>
        </div>
        <div className="card-copy"><h3>{video.title}</h3><span>Watch {shorts ? 'clip' : 'episode'}</span></div>
      </button>
      <a className="video-permalink" href={'/videos/' + video.id + '/'}>
        Episode page<span className="ops-sr">: {video.title}</span>
      </a>
    </article>)}
  </div>;
}

export function VideoVault({videos, onPlay}) {
  const [format, setFormat] = useState(() => window.location.hash === '#shorts' ? 'shorts' : 'episodes');
  const [sort, setSort] = useState('newest');
  const [build, setBuild] = useState('all');
  const [query, setQuery] = useState('');
  const searchInput = useRef(null);
  const shown = useMemo(() => discoverVideos(videos, {format, sort, build, query}), [videos, format, sort, build, query]);
  const changeQuery = event => {
    const value = event.target.value;
    setQuery(value);
    const requested = /\bshorts?\b/i.test(value) ? 'shorts' : /\bepisodes?\b/i.test(value) ? 'episodes' : null;
    setFormat(current => requested || current);
  };
  return <section className="channel-vault" aria-labelledby="vault-title">
    <h1 id="vault-title">Videos</h1>
    <p>Real builds, garage fixes and rides. Choose an episode or catch a short clip.</p>
    <div className="vault-controls">
      <div className="format-toggle" role="group" aria-label="Video format">
        {[['episodes', 'Episodes'], ['shorts', 'Shorts']].map(([value, title]) =>
          <button key={value} aria-pressed={format === value} onClick={() => setFormat(value)}>{title}</button>)}
      </div>
      <label>Search videos<input aria-label="Search videos" ref={searchInput} type="search" maxLength="100" value={query} placeholder="Try SV1000, N54 or Shorts" onChange={changeQuery}/></label>
      {query && <button onClick={() => {setQuery(''); searchInput.current?.focus();}}>Clear search</button>}
      <label>Sort videos<select aria-label="Sort videos" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="longest">Longest</option>
      </select></label>
      <label>Build<select aria-label="Build" value={build} onChange={event => setBuild(event.target.value)}>
        {videoBuilds.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
      </select></label>
    </div>
    <p role="status">{shown.length} {shown.length === 1 ? 'film' : 'films'} / {format === 'episodes' ? 'Episodes' : 'Shorts'}</p>
    {!shown.length && <div className="vault-empty"><h2>No matching videos.</h2><button onClick={() => {setQuery(''); setBuild('all');}}>Clear search and build</button></div>}
    {videoBuilds.slice(1).filter(([id]) => build === 'all' || build === id).map(([id, title]) => {
      const shelf = shown.filter(video => videoBuild(video) === id);
      const showEmpty = !query && build === 'all' && id !== 'other';
      return shelf.length || showEmpty ? <section className="video-shelf" key={id} aria-label={title + ' videos'}>
        <h2>{title}</h2>
        {shelf.length ? <VideoCards videos={shelf} onPlay={onPlay} shorts={format === 'shorts'}/> : <p>
          No {format === 'episodes' ? 'episodes' : 'short clips'} in this shelf.
          {videos.some(video => videoBuild(video) === id && videoFormat(video) !== format) &&
            <button onClick={() => {setBuild(id); setFormat(format === 'episodes' ? 'shorts' : 'episodes');}}>View {title} {format === 'episodes' ? 'Shorts' : 'episodes'}</button>}
        </p>}
      </section> : null;
    })}
    <small>Short clips are grouped by a running time under three minutes; this does not verify a vertical YouTube Shorts format.</small>
  </section>;
}
