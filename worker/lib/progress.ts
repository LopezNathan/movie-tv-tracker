import type { MediaRecord, ShowProgress } from '../../shared/types';

export function calculateProgress(
  showId: string,
  episodes: MediaRecord[],
  watchedMediaIds: Iterable<string>,
  today = new Date().toISOString().slice(0, 10),
): ShowProgress {
  const watchedIds = new Set(watchedMediaIds);
  const airedEpisodes = episodes
    .filter(
      (episode) =>
        episode.seriesId === showId && episode.airDate !== null && episode.airDate <= today,
    )
    .sort(
      (a, b) =>
        (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
        (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0),
    );
  const seasonMap = new Map<number, { watched: number; aired: number }>();

  for (const episode of airedEpisodes) {
    const seasonNumber = episode.seasonNumber ?? 0;
    const season = seasonMap.get(seasonNumber) ?? { watched: 0, aired: 0 };
    season.aired += 1;
    if (watchedIds.has(episode.id)) season.watched += 1;
    seasonMap.set(seasonNumber, season);
  }

  const watched = airedEpisodes.filter((episode) => watchedIds.has(episode.id)).length;
  return {
    showId,
    watched,
    aired: airedEpisodes.length,
    percentage: airedEpisodes.length === 0 ? 0 : Math.round((watched / airedEpisodes.length) * 100),
    nextEpisode: airedEpisodes.find((episode) => !watchedIds.has(episode.id)) ?? null,
    seasons: [...seasonMap.entries()].map(([seasonNumber, counts]) => ({
      seasonNumber,
      ...counts,
    })),
  };
}
