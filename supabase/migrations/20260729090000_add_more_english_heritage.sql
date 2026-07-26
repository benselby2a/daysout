-- More English Heritage properties (55 places), following up on a report
-- that Hurst Castle was missing, with a broader sweep across London, Kent,
-- Sussex, Hampshire/Isle of Wight, Yorkshire, Northumberland, Cumbria,
-- Cornwall/Devon, East Anglia/Essex, the Midlands, Herefordshire, Somerset
-- and Wiltshire, cross-checked against the existing seed to avoid
-- duplicates. Gathered from web search result snippets against
-- english-heritage.org.uk (which blocks direct fetches) and Wikipedia, not
-- scraped from an official directory; coordinates are approximate map
-- positions, same caveat as the rest of the seed. Re-running this is safe:
-- existing names are kept.
--
-- Three are worth a second look rather than being treated as certain:
-- Conisbrough Castle is jointly associated with Doncaster council rather
-- than solely English Heritage; Leiston Abbey was reported as closed to
-- visitors pending conservation work; Bayham Old Abbey's coordinates came
-- from a lower-confidence source than the others here. All three are kept
-- in since the institution tag and coordinates are already treated as
-- correctable starting points throughout this seed.

insert into daysout.properties (name, location, country, institutions, latitude, longitude)
values
  ('Hurst Castle', 'Hampshire', 'England', array['English Heritage'], 50.7064, -1.5512),
  ('Kenwood House', 'Greater London', 'England', array['English Heritage'], 51.5715, -0.1673),
  ('Marble Hill House', 'Greater London', 'England', array['English Heritage'], 51.4494, -0.3133),
  ('Ranger''s House (The Wernher Collection)', 'Greater London', 'England', array['English Heritage'], 51.4734, -0.0016),
  ('Wellington Arch', 'Greater London', 'England', array['English Heritage'], 51.5025, -0.1508),
  ('Apsley House', 'Greater London', 'England', array['English Heritage'], 51.5035, -0.1517),
  ('Jewel Tower', 'Greater London', 'England', array['English Heritage'], 51.4984, -0.1265),
  ('Deal Castle', 'Kent', 'England', array['English Heritage'], 51.2194, 1.4036),
  ('Reculver Towers and Roman Fort', 'Kent', 'England', array['English Heritage'], 51.3791, 1.2019),
  ('Richborough Roman Fort and Amphitheatre', 'Kent', 'England', array['English Heritage'], 51.294, 1.332),
  ('St Augustine''s Abbey', 'Kent', 'England', array['English Heritage'], 51.2789, 1.0871),
  ('Upnor Castle', 'Kent', 'England', array['English Heritage'], 51.4069, 0.5271),
  ('Bayham Old Abbey', 'Kent', 'England', array['English Heritage'], 51.081, 0.352),
  ('Camber Castle', 'East Sussex', 'England', array['English Heritage'], 50.9331, 0.7325),
  ('Netley Abbey', 'Hampshire', 'England', array['English Heritage'], 50.873, -1.3532),
  ('Calshot Castle', 'Hampshire', 'England', array['English Heritage'], 50.82, -1.3075),
  ('Titchfield Abbey', 'Hampshire', 'England', array['English Heritage'], 50.8571, -1.2322),
  ('Medieval Merchant''s House, Southampton', 'Hampshire', 'England', array['English Heritage'], 50.8985, -1.4052),
  ('Appuldurcombe House', 'Isle of Wight', 'England', array['English Heritage'], 50.6176, -1.2331),
  ('Yarmouth Castle', 'Isle of Wight', 'England', array['English Heritage'], 50.7067, -1.5003),
  ('Middleham Castle', 'North Yorkshire', 'England', array['English Heritage'], 54.2841, -1.8069),
  ('Helmsley Castle', 'North Yorkshire', 'England', array['English Heritage'], 54.2448, -1.0643),
  ('Pickering Castle', 'North Yorkshire', 'England', array['English Heritage'], 54.2483, -0.7748),
  ('Byland Abbey', 'North Yorkshire', 'England', array['English Heritage'], 54.2031, -1.1592),
  ('Mount Grace Priory', 'North Yorkshire', 'England', array['English Heritage'], 54.3801, -1.3111),
  ('Conisbrough Castle', 'South Yorkshire', 'England', array['English Heritage'], 53.4842, -1.2264),
  ('Aydon Castle', 'Northumberland', 'England', array['English Heritage'], 54.9914, -1.9994),
  ('Prudhoe Castle', 'Northumberland', 'England', array['English Heritage'], 54.964, -1.854),
  ('Norham Castle', 'Northumberland', 'England', array['English Heritage'], 55.722, -2.149),
  ('Berwick-upon-Tweed Castle and Ramparts', 'Northumberland', 'England', array['English Heritage'], 55.7742, -2.0119),
  ('Etal Castle', 'Northumberland', 'England', array['English Heritage'], 55.648, -2.121),
  ('Brougham Castle', 'Cumbria', 'England', array['English Heritage'], 54.654, -2.7191),
  ('Pendennis Castle', 'Cornwall', 'England', array['English Heritage'], 50.1472, -5.0478),
  ('St Mawes Castle', 'Cornwall', 'England', array['English Heritage'], 50.1549, -5.0238),
  ('Launceston Castle', 'Cornwall', 'England', array['English Heritage'], 50.6376, -4.3614),
  ('Restormel Castle', 'Cornwall', 'England', array['English Heritage'], 50.4223, -4.6715),
  ('Chysauster Ancient Village', 'Cornwall', 'England', array['English Heritage'], 50.1611, -5.5397),
  ('Okehampton Castle', 'Devon', 'England', array['English Heritage'], 50.7305, -4.0086),
  ('Dartmouth Castle', 'Devon', 'England', array['English Heritage'], 50.342, -3.5683),
  ('Berry Pomeroy Castle', 'Devon', 'England', array['English Heritage'], 50.449, -3.6366),
  ('Totnes Castle', 'Devon', 'England', array['English Heritage'], 50.4321, -3.691),
  ('Castle Acre Castle and Bailey Gate', 'Norfolk', 'England', array['English Heritage'], 52.703, 0.6932),
  ('Binham Priory', 'Norfolk', 'England', array['English Heritage'], 52.9211, 0.9477),
  ('Tilbury Fort', 'Essex', 'England', array['English Heritage'], 51.4528, 0.3747),
  ('Hadleigh Castle', 'Essex', 'England', array['English Heritage'], 51.5444, 0.609),
  ('Leiston Abbey', 'Suffolk', 'England', array['English Heritage'], 52.2214, 1.5776),
  ('Hardwick Old Hall', 'Derbyshire', 'England', array['English Heritage'], 53.1684, -1.3111),
  ('Peveril Castle', 'Derbyshire', 'England', array['English Heritage'], 53.3402, -1.7772),
  ('Wigmore Castle', 'Herefordshire', 'England', array['English Heritage'], 52.3177, -2.8714),
  ('Kirby Muxloe Castle', 'Leicestershire', 'England', array['English Heritage'], 52.6366, -1.2272),
  ('Farleigh Hungerford Castle', 'Somerset', 'England', array['English Heritage'], 51.3167, -2.287),
  ('Cleeve Abbey', 'Somerset', 'England', array['English Heritage'], 51.1556, -3.3642),
  ('Muchelney Abbey', 'Somerset', 'England', array['English Heritage'], 51.0203, -2.8158),
  ('Old Wardour Castle', 'Wiltshire', 'England', array['English Heritage'], 51.0365, -2.0888),
  ('Ludgershall Castle', 'Wiltshire', 'England', array['English Heritage'], 51.2596, -1.6233)
on conflict (name) do nothing;
