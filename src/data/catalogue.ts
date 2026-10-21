import type { Anime, Episode, Season } from '../types';

export const DEMO_VIDEO_URL =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_30MB.mp4';

const ep = (
  animeId: string,
  seasonNumber: number,
  number: number,
  title: string,
  synopsis: string,
  durationMinutes = 24,
): Episode => ({
  id: `${animeId}-s${seasonNumber}-e${number}`,
  seasonId: `${animeId}-season-${seasonNumber}`,
  animeId,
  number,
  title,
  synopsis,
  durationMinutes,
});

function season(animeId: string, number: number, title: string): Season {
  return { id: `${animeId}-season-${number}`, animeId, number, title };
}

function episodesFor(anime: Anime): Episode[] {
  const eps: Episode[] = [];
  const count = Math.min(anime.episodeCount, 12);
  for (let i = 1; i <= count; i++) {
    eps.push(
      ep(
        anime.id,
        1,
        i,
        EP_TITLES[i % EP_TITLES.length].replace('{n}', String(i)),
        `Episode ${i} of ${anime.title}. ${anime.synopsis.split('.')[0]}. The story continues as new challenges test our heroes.`,
      ),
    );
  }
  return eps;
}

const EP_TITLES = [
  'The First Step',
  'A Promise Under Starlight',
  'Rival Appears',
  'The Storm Breaks',
  'Echoes of the Past',
  'Blade and Heart',
  'Quiet Days',
  'The Turning Point',
  'Beyond the Clouds',
  'A Duel at Dawn',
  'What We Fight For',
  'The Final Door',
  'The Beginning of the End',
  'Homecoming',
];

export const ANIME_LIST: Anime[] = [
  {
    id: 'a1', slug: 'crimson-fang', title: 'Crimson Fang', nativeTitle: '紅牙',
    synopsis: 'When a quiet rooftop courier befriends a wounded dragon spirit, Ren is pulled into the centuries-old war between the sky clans and the city below. To protect the people who never noticed him, he must learn to wield the fang that burned down the old world.',
    status: 'airing', format: 'TV', year: 2026, season: 'Fall', rating: 8.9, popularity: 9820,
    episodeCount: 12, poster: '/poster-1.webp', cover: '/hero-1.webp',
    genres: ['action', 'fantasy', 'supernatural'], studio: 'Studio Aozora', trending: true, featured: true, demoPlayable: true,
  },
  {
    id: 'a2', slug: 'sea-lantern-letters', title: 'Sea Lantern Letters', nativeTitle: '海灯の手紙',
    synopsis: 'Every spring, Mio flies her delivery route over the coastal town of Hoshizato. This year, a stack of undeliverable letters arrives — each addressed to someone the sea took years ago. Solving their mystery means finally facing her own.',
    status: 'finished', format: 'TV', year: 2025, season: 'Spring', rating: 8.6, popularity: 7410,
    episodeCount: 12, poster: '/poster-2.webp',
    genres: ['slice-of-life', 'drama', 'fantasy'], studio: 'Studio Aozora', trending: true, demoPlayable: true,
  },
  {
    id: 'a3', slug: 'iron-vanguard', title: 'Iron Vanguard', nativeTitle: '鉄の先兵',
    synopsis: 'Two pilots trained on opposite sides of a ceasefire share a hangar, a squadron, and the same nightmare: the war machine they both helped build waking up again. Trust is the only weapon that has never been tested.',
    status: 'airing', format: 'TV', year: 2026, season: 'Fall', rating: 8.2, popularity: 6890,
    episodeCount: 12, poster: '/poster-3.webp',
    genres: ['mecha', 'action', 'sci-fi'], studio: 'Kurogane Works', trending: true, demoPlayable: true,
  },
  {
    id: 'a4', slug: 'five-strikes-of-spring', title: 'Five Strikes of Spring', nativeTitle: '春の五撃',
    synopsis: 'Kendo prodigy Yuzuki has one season left in high school and one rival she has never beaten. Between the dojo, exams and a festival she promised to attend, she learns that the fifth strike is the one you throw for someone else.',
    status: 'finished', format: 'TV', year: 2025, season: 'Spring', rating: 7.9, popularity: 5120,
    episodeCount: 12, poster: '/poster-4.webp',
    genres: ['sports', 'drama', 'slice-of-life'], studio: 'Studio Aozora', demoPlayable: true,
  },
  {
    id: 'a5', slug: 'rain-ledger', title: 'Rain Ledger', nativeTitle: '雨の台帳',
    synopsis: 'In Neonmachi, every illegal deal is written down somewhere. Junior detective Sora keeps the ledger in his head — and tonight somebody is erasing it, alley by alley, before the rain stops.',
    status: 'finished', format: 'TV', year: 2024, season: 'Summer', rating: 8.4, popularity: 6350,
    episodeCount: 12, poster: '/poster-5.webp',
    genres: ['mystery', 'action', 'drama'], studio: 'Kurogane Works', trending: true, demoPlayable: true,
  },
  {
    id: 'a6', slug: 'midnight-ramen', title: 'Midnight Ramen', nativeTitle: '深夜のラーメン',
    synopsis: 'A fox-spirit chef serves one bowl a night to whoever needs it most. A tired office worker, a runaway idol and a ghost with unfinished business all find their way to the same narrow doorway — and to each other.',
    status: 'finished', format: 'TV', year: 2024, season: 'Fall', rating: 8.1, popularity: 4870,
    episodeCount: 12, poster: '/poster-6.webp',
    genres: ['slice-of-life', 'supernatural', 'comedy'], studio: 'Studio Aozora', demoPlayable: true,
  },
  {
    id: 'a7', slug: 'orbital-garden', title: 'Orbital Garden', nativeTitle: '軌道の庭',
    synopsis: 'Aboard the research station Aster, botanist-in-training Luma tends the last seed bank orbiting a dying ringed planet. When an unregistered shuttle docks, her quiet garden becomes the most contested place in the system.',
    status: 'airing', format: 'TV', year: 2026, season: 'Fall', rating: 8.0, popularity: 5640,
    episodeCount: 12, poster: '/poster-7.webp',
    genres: ['sci-fi', 'drama', 'adventure'], studio: 'Hoshi Lab', trending: true, demoPlayable: true,
  },
  {
    id: 'a8', slug: 'summit-lines', title: 'Summit Lines', nativeTitle: '山稜の線',
    synopsis: 'Hinata inherited his grandfather\'s camera and one unfinished photograph: a ridge only visible one hour a year. With a borrowed bicycle and a stubborn map, he sets out to finish what an entire lifetime left open.',
    status: 'finished', format: 'Movie', year: 2025, season: 'Summer', rating: 8.3, popularity: 3980,
    episodeCount: 1, poster: '/poster-8.webp',
    genres: ['adventure', 'drama', 'slice-of-life'], studio: 'Studio Aozora', demoPlayable: true,
  },
  {
    id: 'a9', slug: 'endgame-library', title: 'Endgame Library', nativeTitle: '終局の書庫',
    synopsis: 'In the endless library, every book is a life and every match is a fate. Prodigy Akari plays the game of her generation — until she meets an opponent who has read her ending already.',
    status: 'finished', format: 'TV', year: 2024, season: 'Winter', rating: 7.8, popularity: 3410,
    episodeCount: 12, poster: '/poster-9.webp',
    genres: ['mystery', 'drama', 'supernatural'], studio: 'Hoshi Lab', demoPlayable: true,
  },
  {
    id: 'a10', slug: 'summer-circuit', title: 'Summer Circuit', nativeTitle: '夏の環状線',
    synopsis: 'One road bike, two childhood friends and the ring road around their dying farming town. If they can ride its full length before the last festival, maybe the town — and their friendship — will make it to autumn.',
    status: 'finished', format: 'TV', year: 2025, season: 'Summer', rating: 8.0, popularity: 4230,
    episodeCount: 12, poster: '/poster-10.webp',
    genres: ['sports', 'slice-of-life', 'drama'], studio: 'Studio Aozora', demoPlayable: true,
  },
  {
    id: 'a11', slug: 'wisp-hunter', title: 'Wisp Hunter', nativeTitle: '鬼火狩り',
    synopsis: 'The forest remembers every promise broken under its canopy. Named the Wisp Hunter after a night he cannot remember, Gen must follow the blue lights deeper than any oni has returned from — to find out what he swore.',
    status: 'upcoming', format: 'TV', year: 2027, season: 'Winter', rating: 0, popularity: 2980,
    episodeCount: 12, poster: '/poster-11.webp',
    genres: ['action', 'supernatural', 'fantasy'], studio: 'Kurogane Works', upcoming: true,
  },
  {
    id: 'a12', slug: 'blue-note-alley', title: 'Blue Note Alley', nativeTitle: 'ブルーノート横丁',
    synopsis: 'A stray cat with a trumpet and a dream of one perfect set. Between rain, rent and the neighbourhood closing in, Nao and the alley\'s last jazz bar fight to keep the music playing until sunrise.',
    status: 'upcoming', format: 'ONA', year: 2027, season: 'Winter', rating: 0, popularity: 2150,
    episodeCount: 8, poster: '/poster-12.webp',
    genres: ['drama', 'slice-of-life', 'comedy'], studio: 'Hoshi Lab', upcoming: true,
  },
];

export const SEASONS: Season[] = ANIME_LIST.map((a) => season(a.id, 1, 'Season 1'));

const episodeCache = new Map<string, Episode[]>();

export function getEpisodesForAnime(animeId: string): Episode[] {
  if (!episodeCache.has(animeId)) {
    const anime = ANIME_LIST.find((a) => a.id === animeId);
    episodeCache.set(animeId, anime ? episodesFor(anime) : []);
  }
  return episodeCache.get(animeId)!;
}

export const ANIME_MAP = new Map(ANIME_LIST.map((a) => [a.id, a]));
export const ANIME_BY_SLUG = new Map(ANIME_LIST.map((a) => [a.slug, a]));
