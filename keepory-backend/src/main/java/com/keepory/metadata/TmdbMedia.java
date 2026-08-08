package com.keepory.metadata;

/**
 * The two TMDB catalogs Keepory reads. Their endpoints are the same shape with
 * a different segment, save for the handful of quirks captured here.
 */
public enum TmdbMedia {

    MOVIE("/movie", "primary_release_date", "/movie/now_playing", true),
    TV("/tv", "first_air_date", "/tv/on_the_air", false);

    private final String path;
    private final String dateFilter;
    private final String newReleases;
    private final boolean regional;

    TmdbMedia(String path, String dateFilter, String newReleases, boolean regional) {
        this.path = path;
        this.dateFilter = dateFilter;
        this.newReleases = newReleases;
        this.regional = regional;
    }

    String path() {
        return path;
    }

    /** Prefix of the discover date filter: {@code primary_release_date.gte} and friends. */
    String dateFilter() {
        return dateFilter;
    }

    /** What is out right now: in cinemas for films, on the air for series. */
    String newReleases() {
        return newReleases;
    }

    /** Whether {@link #newReleases()} narrows by country; {@code /tv/on_the_air} does not. */
    boolean regional() {
        return regional;
    }
}
