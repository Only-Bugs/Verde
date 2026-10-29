-- Demo seed data for the rebuilt Verde database. Safe to re-run (INSERT IGNORE + explicit ids).
-- Statements are split on ";" + newline by scripts/init_db.py, so keep ";" out of string literals.
--
-- Unit notes (the Lambdas mix units, so rows are split by which code path reads them):
--  * Baseline.py   reads mapping_table rows by LABEL (weekly_km, baseline_fuel) or by domain+code (pt_freq, B_* diet)
--                  and divides by 1000, so those factors are in grams.
--  * tracking.py   reads mapping_table rows by domain+CODE and uses the value as kg directly.
--  * Labels read without a domain filter by Baseline.py must be unique across the whole table.

INSERT IGNORE INTO emission_factors (id, metric_key, value, unit) VALUES
  (1, 'PRICE_KWH', 0.3000,   'AUD per kWh'),
  (2, 'EF_GRID',   680.0000, 'g CO2e per kWh'),
  (3, 'PRICE_MJ',  0.0350,   'AUD per MJ'),
  (4, 'EF_GAS',    56.0000,  'g CO2e per MJ');

INSERT IGNORE INTO mapping_table (id, domain, code, label, value) VALUES
  (1,  'weekly_km',     'km_lt50',     'Less than 50 km',   25),
  (2,  'weekly_km',     'km_50_150',   '50-150 km',         100),
  (3,  'weekly_km',     'km_150_300',  '150-300 km',        225),
  (4,  'weekly_km',     'km_gt300',    'More than 300 km',  400),
  (5,  'baseline_fuel', 'petrol',      'Petrol',            192),
  (6,  'baseline_fuel', 'diesel',      'Diesel',            171),
  (7,  'baseline_fuel', 'hybrid',      'Hybrid',            105),
  (8,  'baseline_fuel', 'ev',          'Electric',          53),
  (9,  'pt_freq',       'none',        'Public transport: none',       0),
  (10, 'pt_freq',       'occasional',  'Public transport: occasional', 30),
  (11, 'pt_freq',       'regular',     'Public transport: regular',    100),
  (12, 'pt_freq',       'heavy',       'Public transport: heavy',      200),
  (13, 'diet_style',    'B_VEGAN',     'Vegan',             300),
  (14, 'diet_style',    'B_VEG',       'Vegetarian',        400),
  (15, 'diet_style',    'B_FLEX',      'Flexitarian',       500),
  (16, 'diet_style',    'B_OMNI',      'Omnivore',          630),
  (17, 'diet_style',    'B_MEAT',      'Heavy meat',        850),
  (18, 'fuel_type',      'diesel',     'Diesel car (kg per km)',    0.171),
  (19, 'fuel_type',      'petrol',     'Petrol car (kg per km)',    0.192),
  (20, 'fuel_type',      'ev',         'Electric car (kg per km)',  0.053),
  (21, 'fuel_type',      'hybrid',     'Plug-in hybrid (kg per km)', 0.105),
  (22, 'transport_type', 'motorbike',  'Motorbike (kg per km)',     0.103),
  (23, 'transport_type', 'train',      'Train (kg per km)',         0.041),
  (24, 'transport_type', 'bus',        'Bus (kg per km)',           0.089),
  (25, 'flight_type',    'short_haul', 'Short-haul flight (kg per km)', 0.255),
  (26, 'flight_type',    'long_haul',  'Long-haul flight (kg per km)',  0.195),
  (27, 'diet_style',     'Vegan',      'Vegan (kg per day)',        2.0),
  (28, 'diet_style',     'VEG',        'Vegetarian (kg per day)',   2.5),
  (29, 'diet_style',     'FLEX',       'Flexitarian (kg per day)',  3.3),
  (30, 'diet_style',     'OMNI',       'Omnivore (kg per day)',     4.7),
  (31, 'diet_style',     'MEAT',       'Heavy meat (kg per day)',   7.2),
  (32, 'clothes',        'm0_50',      'Clothing $0-$50 (kg per year)',     300),
  (33, 'clothes',        'm51_150',    'Clothing $51-$150 (kg per year)',   900),
  (34, 'clothes',        'm151_300',   'Clothing $151-$300 (kg per year)',  1800),
  (35, 'clothes',        'm301p',      'Clothing $301+ (kg per year)',      3600),
  (36, 'electronics',    'ylt500',     'Electronics under $500 (kg per year)',    600),
  (37, 'electronics',    'y500_1000',  'Electronics $500-$1000 (kg per year)',    1500),
  (38, 'electronics',    'y1001_2000', 'Electronics $1001-$2000 (kg per year)',   3000),
  (39, 'electronics',    'y2001p',     'Electronics $2001+ (kg per year)',        6000);

INSERT IGNORE INTO points_policy (id, category, action, points) VALUES
  (1, 'transport', 'daily_log',   5),
  (2, 'diet',      'daily_log',   5),
  (3, 'shopping',  'daily_log',   5),
  (4, 'energy',    'monthly_log', 100);

INSERT IGNORE INTO questions (id, question_code, text_en, hint, category, input_type, options, default_option, is_active) VALUES
  (1,  'Q1',  'What is your average monthly electricity bill?', 'Enter your usual monthly bill in AUD. If unsure, estimate.', 'energy', 'number', NULL, '120', TRUE),
  (2,  'Q2',  'How many people live in your household?', 'Include yourself when counting household members.', 'energy', 'number_int', NULL, '2', TRUE),
  (3,  'Q3',  'What is your average monthly gas bill?', 'Enter your usual monthly gas bill in AUD. If unsure, estimate.', 'energy', 'number', NULL, '40', TRUE),
  (4,  'Q4',  'Do you own or regularly drive a personal vehicle?', 'Answer yes if you drive a car or motorbike most weeks.', 'transport', 'bool', NULL, '1', TRUE),
  (5,  'Q4A', 'How many kilometres do you drive per week?', 'A rough estimate is fine.', 'transport', 'enum_range', '["Less than 50 km","50-150 km","150-300 km","More than 300 km"]', '50-150 km', TRUE),
  (6,  'Q4B', 'What is your vehicle''s fuel type?', 'Choose the fuel your vehicle mainly uses.', 'transport', 'select_enum', '["Petrol","Diesel","Hybrid","Electric"]', 'Petrol', TRUE),
  (9,  'Q9',  'How often do you use public transport?', 'Occasional = 1-2 trips per week. Regular = 3-4 trips per week. Heavy = 5+ trips per week.', 'transport', 'enum_range', '["none","occasional","regular","heavy"]', 'occasional', TRUE),
  (12, 'Q12', 'How much do you spend on groceries each week?', 'Enter your household weekly grocery spend in AUD.', 'diet', 'number', NULL, '150', TRUE),
  (13, 'Q13', 'Which best describes your diet?', 'Pick the closest match.', 'diet', 'select_enum', '["Vegan","Vegetarian","Flexitarian","Omnivore","Heavy meat"]', 'Omnivore', TRUE);

INSERT IGNORE INTO challenges (challenge_id, category, challenge, challenge_difficulty, challenge_points, challenge_frequency, challenge_progress, challenge_description, challenge_benefit) VALUES
  ('CH14', 'transport', 'Weekly Eco Challenge: Bike to work 3 times', 'Medium', 100, 'weekly', 3, 'Reduce your carbon footprint by cycling to work instead of driving or taking public transport for at least 3 days this week.', 'Cuts commute emissions and boosts fitness'),
  ('CH15', 'diet',      'Go meat-free 2 days this week', 'Easy', 50, 'weekly', 2, 'Replace meat meals with plant-based options for 2 days.', 'Plant-based meals have a much lower footprint'),
  ('CH16', 'waste',     'Recycle 5 items this week', 'Easy', 80, 'weekly', 5, 'Recycle at least 5 household items like plastic, paper, or cans.', 'Keeps materials out of landfill'),
  ('CH17', 'habit',     '7-Day Streak Challenge', 'Hard', 120, 'weekly', 7, 'Complete eco-friendly actions for 7 consecutive days to build a sustainable habit.', 'Builds a lasting low-carbon routine'),
  ('CH18', 'energy',    'Switch off standby power', 'Easy', 60, 'weekly', 3, 'Switch appliances off at the wall on 3 days this week to cut standby energy use.', 'Lower power bill and emissions'),
  ('CH19', 'transport', 'Take public transport 4 times', 'Medium', 90, 'weekly', 4, 'Choose a bus or train instead of driving for 4 trips this week.', 'Shares emissions across many passengers'),
  ('CH20',  'energy',    'Cold-wash laundry', 'Easy', 40, 'weekly', 4, 'Wash clothes in cold water for 4 loads this week.', 'Skips the energy used to heat the water'),
  ('CH21',  'diet',      'Cook with seasonal produce', 'Easy', 50, 'weekly', 3, 'Build 3 meals this week around in-season, local fruit and vegetables.', 'Less transport and storage emissions'),
  ('CH22',  'waste',     'Zero food waste week', 'Hard', 150, 'weekly', 7, 'Eat, freeze or compost all food scraps every day for 7 days.', 'Keeps food waste out of landfill'),
  ('CH23', 'transport', 'Walk short trips', 'Easy', 70, 'weekly', 5, 'Walk instead of driving for 5 trips under 2 km this week.', 'Zero-emission trips and a fitter you'),
  ('CH24', 'energy',    'Four-minute showers', 'Medium', 80, 'weekly', 5, 'Keep your showers to 4 minutes on 5 days this week.', 'Less hot water and less energy to heat it'),
  ('CH25', 'habit',     'Bring your own bags', 'Medium', 90, 'weekly', 3, 'Use reusable bags on 3 shopping trips this week.', 'Cuts single-use plastic'),
  ('CH26', 'energy',    'Review your energy bill', 'Easy', 100, 'monthly', 1, 'Compare your latest electricity bill with last month and note one way to cut it.', 'Spots savings that lower emissions and cost');

INSERT IGNORE INTO articles (article_id, title, author, source_url, summary, reading_time_minutes, published_date, is_featured) VALUES
  ('art-1', 'Cutting Food Waste at Home', 'Sustainability Team', 'https://www.epa.vic.gov.au/', 'Simple steps for planning meals, storing ingredients, and using leftovers to reduce waste.', 6, '2026-10-14', TRUE),
  ('art-2', 'Commute Smarter: Embrace Active Transport', 'Verde Mobility Lab', 'https://www.transport.gov.au/', 'See how short trips by bike or on foot can shrink your carbon footprint and boost wellbeing.', 5, '2026-10-02', FALSE),
  ('art-3', 'Greener Energy Bills Explained', 'Energy Insights', 'https://www.climatecouncil.org.au/', 'Understand renewable tariffs, off-peak usage, and energy monitoring to lower household impact.', 8, '2026-09-21', TRUE),
  ('art-4', 'Smart Home Upgrades for Lower Bills', 'Future Living', 'https://www.energy.gov.au/', 'Pick the right upgrades to lower energy costs and your carbon footprint.', 7, '2026-09-08', FALSE),
  ('art-5', 'Home Composting for Beginners', 'Verde Green Team', 'https://www.dcceew.gov.au/', 'Turn kitchen scraps into soil conditioner and keep organic waste out of landfill.', 4, '2026-10-22', TRUE),
  ('art-6', 'Understanding Your Carbon Footprint', 'Energy Insights', 'https://www.dcceew.gov.au/', 'A plain-language guide to where household emissions come from and which habits matter most.', 6, '2026-10-27', FALSE);

INSERT IGNORE INTO tips (id, body) VALUES
  (1, 'Switch appliances off at the wall - standby power adds up across a year.'),
  (2, 'Try one meat-free day a week to noticeably cut your food footprint.'),
  (3, 'Wash clothes in cold water and line-dry when the weather allows.'),
  (4, 'Combine errands into one trip to save fuel and emissions.'),
  (5, 'Plan meals and shop with a list to reduce food waste.'),
  (6, 'Set your heater a degree lower and your cooler a degree higher.'),
  (7, 'Swap remaining old bulbs for LEDs - same light, far less electricity.'),
  (8, 'Choose seasonal, local produce to cut transport and storage emissions.');

INSERT IGNORE INTO quiz_topic (id, name, description) VALUES
  ('1', 'Home Energy', 'Everyday ways to use less energy at home'),
  ('2', 'Sustainable Transport', 'Getting around with a smaller footprint'),
  ('3', 'Food and Waste', 'How food choices and waste shape your footprint');

INSERT IGNORE INTO quiz_question (id, topic_id, bank_batch, seq_order, stem_text, status) VALUES
  ('1',  '1', 1, 1, 'Which use typically accounts for the largest share of energy in an Australian home?', 'published'),
  ('2',  '1', 1, 2, 'What is the main benefit of switching from incandescent to LED bulbs?', 'published'),
  ('3',  '1', 1, 3, 'What is the best way to reduce standby ("vampire") power use?', 'published'),
  ('4',  '1', 1, 4, 'Which habit most directly reduces hot-water energy use?', 'published'),
  ('5',  '1', 1, 5, 'What does lowering your heating thermostat by a degree do?', 'published'),
  ('6',  '2', 1, 1, 'Which option generally has the lowest emissions per passenger-kilometre?', 'published'),
  ('7',  '2', 1, 2, 'Why does car-pooling cut emissions?', 'published'),
  ('8',  '2', 1, 3, 'What mostly determines an electric car''s emissions?', 'published'),
  ('9',  '2', 1, 4, 'Why does keeping tyres properly inflated help?', 'published'),
  ('10', '2', 1, 5, 'What is a climate benefit of working from home one day a week?', 'published'),
  ('11', '3', 1, 1, 'Which food typically has the highest greenhouse gas footprint per kilogram?', 'published'),
  ('12', '3', 1, 2, 'What is the most effective way to cut food waste at home?', 'published'),
  ('13', '3', 1, 3, 'What happens to food scraps in landfill?', 'published'),
  ('14', '3', 1, 4, 'What is the main benefit of composting food scraps?', 'published'),
  ('15', '3', 1, 5, 'Choosing seasonal, local produce can reduce what?', 'published');

INSERT IGNORE INTO quiz_option (id, question_id, option_text, is_correct, explanation) VALUES
  ('1',  '1',  'Heating and cooling', 1, 'Heating and cooling are usually the biggest slice of household energy use.'),
  ('2',  '1',  'Television', 0, 'A TV uses far less than heating and cooling.'),
  ('3',  '1',  'Phone charging', 0, 'Charging a phone is a tiny share of home energy.'),
  ('4',  '1',  'Toaster', 0, 'A toaster runs only briefly each day.'),
  ('5',  '2',  'It uses far less electricity for the same light', 1, 'LEDs produce the same light with a fraction of the energy.'),
  ('6',  '2',  'It makes the light warmer', 0, 'Colour is a separate choice from efficiency.'),
  ('7',  '2',  'It lets you use dimmer rooms', 0, 'Brightness is not the main benefit.'),
  ('8',  '2',  'It removes the need for a switch', 0, 'You still switch lights off to save energy.'),
  ('9',  '3',  'Switch appliances off at the wall', 1, 'Switching off at the wall stops standby draw completely.'),
  ('10', '3',  'Leave them plugged in but unused', 0, 'Plugged-in devices keep drawing standby power.'),
  ('11', '3',  'Use a bigger power board', 0, 'A bigger board does not reduce consumption.'),
  ('12', '3',  'Turn the lights down', 0, 'Lights are unrelated to standby draw.'),
  ('13', '4',  'Taking shorter showers', 1, 'Less hot water used means less energy to heat it.'),
  ('14', '4',  'Taking longer baths', 0, 'Baths use more hot water than a short shower.'),
  ('15', '4',  'Raising the water heater temperature', 0, 'A hotter setting uses more energy.'),
  ('16', '4',  'Running the tap while brushing teeth', 0, 'Running taps waste water and heating energy.'),
  ('17', '5',  'Reduces heating energy use', 1, 'Every degree lower means the heater works less.'),
  ('18', '5',  'Has no effect', 0, 'Thermostat settings directly change how hard the heater works.'),
  ('19', '5',  'Doubles your heating bill', 0, 'Lower settings reduce, not increase, usage.'),
  ('20', '5',  'Only matters in summer', 0, 'It affects heating all winter.'),
  ('21', '6',  'Cycling', 1, 'Cycling has near-zero direct emissions per kilometre.'),
  ('22', '6',  'A petrol car with one occupant', 0, 'A single occupant carries all the emissions.'),
  ('23', '6',  'A short-haul flight', 0, 'Flying has a high footprint per kilometre.'),
  ('24', '6',  'A diesel SUV', 0, 'Larger vehicles emit more per kilometre.'),
  ('25', '7',  'Emissions are shared across more passengers', 1, 'The same trip is split between several people.'),
  ('26', '7',  'The car becomes electric', 0, 'Car-pooling does not change the fuel type.'),
  ('27', '7',  'The trip gets longer', 0, 'Trip length is unrelated.'),
  ('28', '7',  'It avoids using fuel entirely', 0, 'The car still burns fuel.'),
  ('29', '8',  'How the electricity is generated', 1, 'A cleaner grid means a lower-emission EV.'),
  ('30', '8',  'The colour of the car', 0, 'Colour has no effect on emissions.'),
  ('31', '8',  'The brand of tyres', 0, 'Tyres have a minor effect only.'),
  ('32', '8',  'Which radio station is playing', 0, 'Entertainment does not affect emissions.'),
  ('33', '9',  'It reduces rolling resistance and fuel use', 1, 'Under-inflated tyres make the engine work harder.'),
  ('34', '9',  'It makes the car quieter only', 0, 'Fuel savings are the main benefit.'),
  ('35', '9',  'It increases the engine size', 0, 'Tyre pressure does not change the engine.'),
  ('36', '9',  'It has no effect', 0, 'Pressure changes fuel efficiency.'),
  ('37', '10', 'It avoids commute travel emissions', 1, 'No commute means no commuting fuel or fares.'),
  ('38', '10', 'It makes the office warmer', 0, 'Office temperature is not the benefit.'),
  ('39', '10', 'It guarantees renewable power', 0, 'Your power source is unchanged.'),
  ('40', '10', 'It increases travel', 0, 'It reduces travel.'),
  ('41', '11', 'Beef', 1, 'Beef has among the highest footprints per kilogram of any common food.'),
  ('42', '11', 'Lentils', 0, 'Pulses have a low footprint.'),
  ('43', '11', 'Apples', 0, 'Fruit generally has a low footprint.'),
  ('44', '11', 'Potatoes', 0, 'Root vegetables have a low footprint.'),
  ('45', '12', 'Plan meals and shop with a list', 1, 'Buying only what you need prevents most waste.'),
  ('46', '12', 'Buy in bulk without a plan', 0, 'Unplanned bulk buying often ends in the bin.'),
  ('47', '12', 'Throw out food at the use-by date regardless', 0, 'Planning and storage matter more.'),
  ('48', '12', 'Cook much larger portions', 0, 'Over-cooking creates leftovers that go to waste.'),
  ('49', '13', 'They rot without oxygen and release methane', 1, 'Methane is a potent greenhouse gas.'),
  ('50', '13', 'They vanish with no impact', 0, 'Landfill food waste does cause emissions.'),
  ('51', '13', 'They turn into plastic', 0, 'Food scraps do not become plastic.'),
  ('52', '13', 'They freeze permanently', 0, 'They decompose.'),
  ('53', '14', 'It keeps waste out of landfill and makes soil conditioner', 1, 'Compost returns nutrients to soil and avoids landfill methane.'),
  ('54', '14', 'It makes food last longer', 0, 'Composting is for scraps, not storage.'),
  ('55', '14', 'It removes the need for recycling', 0, 'Recycling is still needed.'),
  ('56', '14', 'It heats the home', 0, 'Home compost is not a heating source.'),
  ('57', '15', 'Transport and storage emissions', 1, 'Local, in-season food travels less and needs less storage.'),
  ('58', '15', 'The nutrients in food', 0, 'Nutrition is not reduced.'),
  ('59', '15', 'Cooking time', 0, 'Cooking time is unchanged.'),
  ('60', '15', 'The need to eat vegetables', 0, 'Vegetables remain a healthy choice.');

-- Demo user with a week of tracking history so the dashboard is populated on first open.
INSERT IGNORE INTO users (id, baseline_daily, baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet, baseline_yearly, carbon_point, created_at, updated_at) VALUES
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', 0, 210.000, 77.000, 190.000, 477.000, 240, DATE_SUB(NOW(), INTERVAL 45 DAY), NOW());

INSERT IGNORE INTO daily_logs (user_id, log_date, energy_kg, transport_kg, diet_kg, shopping_kg) VALUES
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 6 DAY), 0.000, 4.200, 4.700, 0.000),
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 5 DAY), 0.000, 1.800, 3.300, 2.100),
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 4 DAY), 0.000, 0.900, 2.500, 0.000),
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 0.000, 3.600, 4.700, 0.000),
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 0.000, 0.400, 2.000, 4.200),
  ('0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 0.000, 2.700, 3.300, 0.000);

INSERT IGNORE INTO user_challenges (id, user_id, challenge_id, frequency, period_start, target_count, progress_count, status, started_at, last_progress_at) VALUES
  (1, '0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60', 'CH15', 'weekly', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 2, 1, 'In Progress', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW());

-- Demo user VerdeDev007: 30 days of tracking history, 6 challenges (4 active, 2 completed).
INSERT IGNORE INTO users (id, baseline_daily, baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet, baseline_yearly, carbon_point, created_at, updated_at) VALUES
  ('VerdeDev007', 0, 210.000, 77.000, 190.000, 477.000, 620, DATE_SUB(NOW(), INTERVAL 45 DAY), NOW());

INSERT IGNORE INTO daily_logs (user_id, log_date, energy_kg, transport_kg, diet_kg, shopping_kg) VALUES
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 0.000, 1.800, 2.500, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 0.000, 2.700, 3.300, 0.800),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 0.000, 4.200, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 0.000, 1.300, 4.700, 0.800),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 4 DAY), 0.000, 0.900, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 5 DAY), 0.000, 3.100, 2.500, 4.200),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 6 DAY), 5.500, 2.200, 2.500, 2.100),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 7 DAY), 0.000, 2.700, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 8 DAY), 0.000, 3.600, 3.300, 2.100),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 9 DAY), 0.000, 0.900, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 10 DAY), 0.000, 0.400, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 11 DAY), 0.000, 4.200, 2.000, 4.200),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 12 DAY), 0.000, 0.400, 2.500, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 13 DAY), 0.000, 1.800, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 14 DAY), 0.000, 3.600, 2.000, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 15 DAY), 0.000, 1.800, 2.500, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 16 DAY), 0.000, 2.700, 3.300, 0.800),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 17 DAY), 0.000, 4.200, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 18 DAY), 0.000, 1.300, 4.700, 0.800),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 19 DAY), 0.000, 0.900, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 20 DAY), 0.000, 3.100, 2.500, 4.200),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 21 DAY), 7.800, 2.200, 2.500, 2.100),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 22 DAY), 0.000, 2.700, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 23 DAY), 0.000, 3.600, 3.300, 2.100),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 24 DAY), 0.000, 0.900, 3.300, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 25 DAY), 0.000, 0.400, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 26 DAY), 0.000, 4.200, 2.000, 4.200),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 27 DAY), 0.000, 0.400, 2.500, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 28 DAY), 0.000, 1.800, 4.700, 0.000),
  ('VerdeDev007', DATE_SUB(CURDATE(), INTERVAL 29 DAY), 0.000, 3.600, 2.000, 0.000);

INSERT IGNORE INTO user_challenges (id, user_id, challenge_id, frequency, period_start, target_count, progress_count, status, started_at, last_progress_at, completed_at) VALUES
  (101, 'VerdeDev007', 'CH14', 'weekly', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 3, 1, 'In Progress', DATE_SUB(NOW(), INTERVAL 2 DAY), NOW(), NULL),
  (102, 'VerdeDev007', 'CH15', 'weekly', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 2, 1, 'In Progress', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW(), NULL),
  (103, 'VerdeDev007', 'CH19', 'weekly', DATE_SUB(CURDATE(), INTERVAL 4 DAY), 4, 2, 'In Progress', DATE_SUB(NOW(), INTERVAL 4 DAY), NOW(), NULL),
  (104, 'VerdeDev007', 'CH23', 'weekly', DATE_SUB(CURDATE(), INTERVAL 5 DAY), 5, 3, 'In Progress', DATE_SUB(NOW(), INTERVAL 5 DAY), NOW(), NULL),
  (105, 'VerdeDev007', 'CH16', 'weekly', DATE_SUB(CURDATE(), INTERVAL 20 DAY), 5, 5, 'Completed', DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY)),
  (106, 'VerdeDev007', 'CH18', 'weekly', DATE_SUB(CURDATE(), INTERVAL 12 DAY), 3, 3, 'Completed', DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY));

