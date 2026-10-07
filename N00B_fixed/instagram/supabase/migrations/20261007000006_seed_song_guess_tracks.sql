-- Guess the Song had zero tracks in its pool (needs 4+ to ever start a round) because nobody had
-- used the admin "Manage songs" panel yet to add any via YouTube link. Seeds 8 well-known, verified-
-- embeddable tracks (checked live against YouTube's oEmbed endpoint before writing this) so the game
-- actually has something to play right away — the admin can still add more or remove these later
-- from the same panel. The round picker already does `order by random()` over whatever's in the
-- pool, so this already plays a different, random one of these each round.
insert into public.song_guess_tracks (title, artist, audio_url, youtube_video_id, clip_start_seconds, clip_length_seconds)
select v.title, v.artist, '', v.yt, 30, 10
from (values
  ('Never Gonna Give You Up', 'Rick Astley', 'dQw4w9WgXcQ'),
  ('Gangnam Style', 'PSY', '9bZkp7q19f0'),
  ('Shape of You', 'Ed Sheeran', 'JGwWNGJdvx8'),
  ('Uptown Funk', 'Mark Ronson ft. Bruno Mars', 'OPf0YbXqDm0'),
  ('Despacito', 'Luis Fonsi ft. Daddy Yankee', 'kJQP7kiw5Fk'),
  ('Shake It Off', 'Taylor Swift', 'nfWlot6h_JM'),
  ('Believer', 'Imagine Dragons', '7wtfhZwyrcc'),
  ('Blinding Lights', 'The Weeknd', '4NRXx6U8ABQ')
) as v(title, artist, yt)
where not exists (select 1 from public.song_guess_tracks t where t.youtube_video_id = v.yt);
