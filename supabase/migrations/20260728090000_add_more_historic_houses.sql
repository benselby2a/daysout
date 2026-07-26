-- More Historic Houses properties (37 places), reported missing by name
-- (Doddington House, Godinton House) and followed up with a broader regional
-- sweep (Kent, Sussex, Yorkshire, Cotswolds/Midlands, North West, East
-- Anglia, Cornwall/Devon, Scotland, Wales) cross-checked against the existing
-- seed. Gathered from web search result snippets against historichouses.org
-- (which blocks direct fetches), not scraped from an official directory;
-- coordinates are approximate map positions, same caveat as the rest of the
-- seed. Re-running this is safe: existing names are kept.
--
-- No "Doddington House" member could be found under that exact name or in
-- Wiltshire as reported — likely a mix-up with one of these two similarly
-- named members, both included so either (or both) can stay:
-- Doddington Hall and Gardens (Lincolnshire) and Doddington Place Gardens
-- (Kent).

insert into daysout.properties (name, location, country, institutions, latitude, longitude)
values
  ('Godinton House and Gardens', 'Kent', 'England', array['Historic Houses'], 51.1596, 0.8332),
  ('Doddington Hall and Gardens', 'Lincolnshire', 'England', array['Historic Houses'], 53.2196, -0.654),
  ('Doddington Place Gardens', 'Kent', 'England', array['Historic Houses'], 51.2837, 0.7857),
  ('Penshurst Place', 'Kent', 'England', array['Historic Houses'], 51.1746, 0.1838),
  ('Firle Place', 'East Sussex', 'England', array['Historic Houses'], 50.845, 0.0916),
  ('Glynde Place', 'East Sussex', 'England', array['Historic Houses'], 50.8653, 0.0681),
  ('Dorney Court', 'Buckinghamshire', 'England', array['Historic Houses'], 51.5024, -0.6759),
  ('West Dean Gardens', 'West Sussex', 'England', array['Historic Houses'], 50.9052, -0.7814),
  ('Parham House and Gardens', 'West Sussex', 'England', array['Historic Houses'], 50.9177, -0.4933),
  ('Haddon Hall', 'Derbyshire', 'England', array['Historic Houses'], 53.2134, -1.6748),
  ('Arbury Hall', 'Warwickshire', 'England', array['Historic Houses'], 52.5005, -1.5089),
  ('Weston Park', 'Staffordshire', 'England', array['Historic Houses'], 52.6953, -2.3004),
  ('Dalemain', 'Cumbria', 'England', array['Historic Houses'], 54.6343, -2.8115),
  ('Hutton-in-the-Forest', 'Cumbria', 'England', array['Historic Houses'], 54.714, -2.839),
  ('Capesthorne Hall', 'Cheshire', 'England', array['Historic Houses'], 53.2517, -2.2406),
  ('Muncaster Castle', 'Cumbria', 'England', array['Historic Houses'], 54.3546, -3.3808),
  ('Caerhays Castle', 'Cornwall', 'England', array['Historic Houses'], 50.2341, -4.8479),
  ('Kentwell Hall', 'Suffolk', 'England', array['Historic Houses'], 52.0985, 0.7189),
  ('Somerleyton Hall', 'Suffolk', 'England', array['Historic Houses'], 52.5207, 1.6731),
  ('Hindringham Hall', 'Norfolk', 'England', array['Historic Houses'], 52.8907, 0.9401),
  ('Burton Agnes Hall', 'East Yorkshire', 'England', array['Historic Houses'], 54.0529, -0.3139),
  ('Burton Constable Hall', 'East Yorkshire', 'England', array['Historic Houses'], 53.8149, -0.1988),
  ('Bramham Park', 'West Yorkshire', 'England', array['Historic Houses'], 53.8688, -1.3743),
  ('Duncombe Park', 'North Yorkshire', 'England', array['Historic Houses'], 54.2385, -1.0833),
  ('Hovingham Hall', 'North Yorkshire', 'England', array['Historic Houses'], 54.1726, -0.9811),
  ('Ripley Castle', 'North Yorkshire', 'England', array['Historic Houses'], 54.0402, -1.5705),
  ('Markenfield Hall', 'North Yorkshire', 'England', array['Historic Houses'], 54.1016, -1.551),
  ('Norton Conyers', 'North Yorkshire', 'England', array['Historic Houses'], 54.181, -1.5114),
  ('Scampston Hall', 'North Yorkshire', 'England', array['Historic Houses'], 54.1683, -0.677),
  ('Kiplin Hall', 'North Yorkshire', 'England', array['Historic Houses'], 54.372, -1.579),
  ('Plumpton Rocks', 'North Yorkshire', 'England', array['Historic Houses'], 53.9784, -1.4597),
  ('Sion Hill Hall', 'North Yorkshire', 'England', array['Historic Houses'], 54.2541, -1.4283),
  ('Sutton Park', 'North Yorkshire', 'England', array['Historic Houses'], 54.0737, -1.1103),
  ('Bodrhyddan Hall', 'Denbighshire', 'Wales', array['Historic Houses'], 53.2973, -3.4328),
  ('Gwrych Castle', 'Conwy', 'Wales', array['Historic Houses'], 53.2833, -3.6085),
  ('Skaill House', 'Orkney', 'Scotland', array['Historic Houses'], 59.0476, -3.3366),
  ('Dunnottar Castle', 'Aberdeenshire', 'Scotland', array['Historic Houses'], 56.946, -2.1971)
on conflict (name) do nothing;
