-- Pay runs can be approved/finalised without an HMRC FPS submit yet.
alter type public.submission_status add value if not exists 'finalised';
