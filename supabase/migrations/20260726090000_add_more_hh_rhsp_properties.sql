-- More Historic Houses and RHS Partner Garden properties (52 places),
-- filling out two categories that were thin in the original seed. Gathered
-- from web search result snippets against historichouses.org and rhs.org.uk
-- (both block direct fetches), cross-checked against each other; coordinates
-- are approximate map positions, same as the original seed. Re-running this
-- is safe: existing names are kept, and the two institution updates below are
-- idempotent.

insert into daysout.properties (name, location, country, institutions, latitude, longitude)
values
  ('Althorp', 'Northamptonshire', 'England', array['Historic Houses'], 52.303, -0.973),
  ('Knebworth House', 'Hertfordshire', 'England', array['Historic Houses'], 51.8508, -0.1953),
  ('Wentworth Woodhouse', 'South Yorkshire', 'England', array['Historic Houses'], 53.4936, -1.3583),
  ('Bolton Castle', 'North Yorkshire', 'England', array['Historic Houses'], 54.3011, -1.9236),
  ('Brockfield Hall', 'North Yorkshire', 'England', array['Historic Houses'], 53.9647, -1.0122),
  ('Parcevall Hall Gardens', 'North Yorkshire', 'England', array['Historic Houses'], 54.0665, -1.9187),
  ('Grimsthorpe Castle, Park and Gardens', 'Lincolnshire', 'England', array['Historic Houses'], 52.7908, -0.4165),
  ('Sudeley Castle and Gardens', 'Gloucestershire', 'England', array['Historic Houses'], 51.9518, -1.9534),
  ('Stanway House', 'Gloucestershire', 'England', array['Historic Houses'], 51.9741, -1.9017),
  ('Sezincote House', 'Gloucestershire', 'England', array['Historic Houses'], 51.9967, -1.7394),
  ('Kelmscott Manor', 'Oxfordshire', 'England', array['Historic Houses'], 51.6853, -1.6444),
  ('Rodmarton Manor', 'Gloucestershire', 'England', array['Historic Houses'], 51.7154, -2.0503),
  ('Corsham Court', 'Wiltshire', 'England', array['Historic Houses'], 51.4258, -2.1897),
  ('Eastnor Castle', 'Herefordshire', 'England', array['Historic Houses'], 52.0333, -2.4177),
  ('Little Malvern Court', 'Worcestershire', 'England', array['Historic Houses'], 52.0642, -2.3298),
  ('Walcot Hall', 'Shropshire', 'England', array['Historic Houses'], 52.4344, -2.8377),
  ('Lullingstone Castle', 'Kent', 'England', array['Historic Houses'], 51.3746, 0.1961),
  ('Chawton House', 'Hampshire', 'England', array['Historic Houses'], 51.1444, -0.9776),
  ('Loseley Park', 'Surrey', 'England', array['Historic Houses'], 51.2129, -0.6206),
  ('Wolterton Hall', 'Norfolk', 'England', array['Historic Houses'], 52.8636, 1.2394),
  ('Somerleyton Hall and Gardens', 'Suffolk', 'England', array['Historic Houses'], 52.4894, 1.6469),
  ('Floors Castle', 'Scottish Borders', 'Scotland', array['Historic Houses'], 55.6017, -2.446),
  ('Thirlestane Castle', 'Scottish Borders', 'Scotland', array['Historic Houses'], 55.6083, -2.6773),
  ('Traquair House', 'Scottish Borders', 'Scotland', array['Historic Houses'], 55.5716, -3.018),
  ('Dunrobin Castle', 'Highland', 'Scotland', array['Historic Houses'], 57.9698, -3.9469),
  ('York Gate Garden', 'West Yorkshire', 'England', array['RHS Partner Garden'], 53.8647, -1.5936),
  ('Sefton Park Palm House', 'Merseyside', 'England', array['RHS Partner Garden'], 53.3778, -2.9251),
  ('East Lambrook Manor Garden', 'Somerset', 'England', array['RHS Partner Garden'], 50.9613, -2.7936),
  ('The Newt in Somerset', 'Somerset', 'England', array['RHS Partner Garden'], 51.087, -2.599),
  ('Hestercombe House and Gardens', 'Somerset', 'England', array['RHS Partner Garden'], 51.0219, -3.1414),
  ('The Bishop''s Palace Gardens', 'Somerset', 'England', array['RHS Partner Garden'], 51.2088, -2.6444),
  ('Kilver Court Gardens', 'Somerset', 'England', array['RHS Partner Garden'], 51.1929, -2.5453),
  ('Keyneston Mill', 'Dorset', 'England', array['RHS Partner Garden'], 50.8917, -2.1614),
  ('Forde Abbey and Gardens', 'Dorset', 'England', array['RHS Partner Garden'], 50.8347, -2.7936),
  ('Minterne Gardens', 'Dorset', 'England', array['RHS Partner Garden'], 50.8206, -2.4802),
  ('Athelhampton House and Gardens', 'Dorset', 'England', array['RHS Partner Garden'], 50.7361, -2.3628),
  ('Compton Acres', 'Dorset', 'England', array['RHS Partner Garden'], 50.708, -1.9494),
  ('Dartington Hall Gardens', 'Devon', 'England', array['RHS Partner Garden'], 50.4406, -3.6997),
  ('Coleton Fishacre', 'Devon', 'England', array['RHS Partner Garden'], 50.3311, -3.5636),
  ('Castle Hill Gardens', 'Devon', 'England', array['RHS Partner Garden'], 51.0126, -3.8347),
  ('Hotel Endsleigh Gardens', 'Devon', 'England', array['RHS Partner Garden'], 50.5661, -4.2436),
  ('Wyken Hall Gardens', 'Suffolk', 'England', array['RHS Partner Garden'], 52.2494, 0.8264),
  ('Castle Bromwich Hall Gardens', 'West Midlands', 'England', array['RHS Partner Garden'], 52.5083, -1.7728),
  ('Cascades Gardens', 'Derbyshire', 'England', array['RHS Partner Garden'], 53.085, -1.4544),
  ('Bluebell Arboretum and Nursery', 'Derbyshire', 'England', array['RHS Partner Garden'], 52.7539, -1.4694),
  ('Himalayan Garden and Sculpture Park', 'North Yorkshire', 'England', array['RHS Partner Garden'], 54.2419, -1.5661),
  ('Teasses Gardens', 'Fife', 'Scotland', array['RHS Partner Garden'], 56.2775, -2.8734),
  ('Castle Kennedy Gardens', 'Dumfries and Galloway', 'Scotland', array['RHS Partner Garden'], 54.9014, -4.9425),
  ('Abbotsford House Gardens', 'Scottish Borders', 'Scotland', array['RHS Partner Garden'], 55.5989, -2.7789),
  ('Cae Hir Gardens', 'Ceredigion', 'Wales', array['RHS Partner Garden'], 52.2064, -4.1394),
  ('Dyffryn Fernant Garden', 'Pembrokeshire', 'Wales', array['RHS Partner Garden'], 51.9814, -4.8964),
  ('Plas Cadnant Hidden Gardens', 'Anglesey', 'Wales', array['RHS Partner Garden'], 53.2306, -4.1633)
on conflict (name) do nothing;

-- The Eden Project and Walmer Castle both joined the RHS Partner Garden
-- scheme for 2026, after the original seed was written.
update daysout.properties
set institutions = array_append(institutions, 'RHS Partner Garden')
where name = 'The Eden Project' and not ('RHS Partner Garden' = any(institutions));

update daysout.properties
set institutions = array_append(institutions, 'RHS Partner Garden')
where name = 'Walmer Castle and Gardens' and not ('RHS Partner Garden' = any(institutions));
