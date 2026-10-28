truncate table public.schedule_types cascade;

insert into public.schedule_types (code, name, passing_minutes) values
  ('blue', 'Blue', 5),
  ('white', 'White', 5),
  ('ram', 'RAM', 5),
  ('er_white', 'ER White', 5);

insert into public.schedule_blocks (schedule_type_code, code, name, kind, start_time, end_time) values
  -- Blue
  ('blue', 'p1', '1st Period', 'period', '07:30', '09:00'),
  ('blue', 'passing1', 'Passing Period', 'passing', '09:00', '09:05'),
  ('blue', 'home', 'Home Lab', 'period', '09:05', '09:25'),
  ('blue', 'passing2', 'Passing Period', 'passing', '09:25', '09:30'),
  ('blue', 'seminar1', 'Seminar L1', 'period', '09:30', '09:50'),
  ('blue', 'passing3', 'Passing Period', 'passing', '09:50', '09:55'),
  ('blue', 'seminar2', 'Seminar L2', 'period', '09:55', '10:40'),
  ('blue', 'passing4', 'Passing Period', 'passing', '10:40', '10:45'),
  ('blue', 'p5', '5th Period', 'period', '10:45', '12:55'),
  ('blue', 'passing5', 'Passing Period', 'passing', '12:55', '13:00'),
  ('blue', 'p7', '7th Period', 'period', '13:00', '14:30'),
  -- White
  ('white', 'p2', '2nd Period', 'period', '07:30', '09:00'),
  ('white', 'passing1', 'Passing Period', 'passing', '09:00', '09:05'),
  ('white', 'p4', '4th Period', 'period', '09:05', '10:40'),
  ('white', 'passing2', 'Passing Period', 'passing', '10:40', '10:45'),
  ('white', 'p6', '6th Period', 'period', '10:45', '12:55'),
  ('white', 'passing3', 'Passing Period', 'passing', '12:55', '13:00'),
  ('white', 'p8', '8th Period', 'period', '13:00', '14:30'),
  -- RAM
  ('ram', 'p1', '1st Period', 'period', '07:30', '08:20'),
  ('ram', 'passing1', 'Passing Period', 'passing', '08:20', '08:25'),
  ('ram', 'p2', '2nd Period', 'period', '08:25', '09:15'),
  ('ram', 'passing2', 'Passing Period', 'passing', '09:15', '09:20'),
  ('ram', 'p4', '4th Period', 'period', '09:20', '10:10'),
  ('ram', 'passing3', 'Passing Period', 'passing', '10:10', '10:15'),
  ('ram', 'p5', '5th Period', 'period', '10:15', '11:05'),
  ('ram', 'passing4', 'Passing Period', 'passing', '11:05', '11:10'),
  ('ram', 'p6', '6th Period', 'period', '11:10', '12:40'),
  ('ram', 'passing5', 'Passing Period', 'passing', '12:40', '12:45'),
  ('ram', 'p7', '7th Period', 'period', '12:45', '13:35'),
  ('ram', 'passing6', 'Passing Period', 'passing', '13:35', '13:40'),
  ('ram', 'p8', '8th Period', 'period', '13:40', '14:30'),
  -- ER White (early release: no lunches, ends at 12:00)
  ('er_white', 'p2', '2nd Period', 'period', '07:30', '08:35'),
  ('er_white', 'passing1', 'Passing Period', 'passing', '08:35', '08:40'),
  ('er_white', 'p4', '4th Period', 'period', '08:40', '09:40'),
  ('er_white', 'passing2', 'Passing Period', 'passing', '09:40', '09:45'),
  ('er_white', 'p6', '6th Period', 'period', '09:45', '10:50'),
  ('er_white', 'passing3', 'Passing Period', 'passing', '10:50', '10:55'),
  ('er_white', 'p8', '8th Period', 'period', '10:55', '12:00');

insert into public.lunch_periods (
  schedule_type_code, code, name, during_block_code, start_time, end_time
) values
  ('blue', 'A', 'A Lunch', 'p5', '10:45', '11:15'),
  ('blue', 'B', 'B Lunch', 'p5', '11:35', '12:05'),
  ('blue', 'C', 'C Lunch', 'p5', '12:30', '12:55'),
  ('white', 'A', 'A Lunch', 'p6', '10:45', '11:15'),
  ('white', 'B', 'B Lunch', 'p6', '11:35', '12:05'),
  ('white', 'C', 'C Lunch', 'p6', '12:30', '12:55'),
  ('ram', 'A', 'A Lunch', 'p6', '11:10', '11:35'),
  ('ram', 'B', 'B Lunch', 'p6', '11:40', '12:10'),
  ('ram', 'C', 'C Lunch', 'p6', '12:15', '12:40');

insert into public.weekly_schedule (weekday, schedule_type_code) values
  (1, 'blue'),
  (2, 'white'),
  (3, 'ram'),
  (4, 'blue'),
  (5, 'white'),
  (6, null),
  (7, null);

insert into public.school_calendar (date, schedule_type_code, note) values
  ('2026-08-25', 'blue', 'Schedule exception'),
  ('2026-08-26', 'white', 'Schedule exception'),
  ('2026-08-27', 'blue', 'Schedule exception'),
  ('2026-08-28', 'white', 'Schedule exception'),
  ('2026-09-07', null, 'No school'),
  ('2026-09-08', 'blue', 'Schedule exception'),
  ('2026-09-09', 'white', 'Schedule exception'),
  ('2026-09-10', 'blue', 'Schedule exception'),
  ('2026-09-11', 'white', 'Schedule exception'),
  ('2026-10-16', 'er_white', 'Schedule exception'),
  ('2026-10-19', 'blue', 'Schedule exception'),
  ('2026-10-20', 'white', 'Schedule exception'),
  ('2026-10-21', 'blue', 'Schedule exception'),
  ('2026-10-22', 'er_white', 'Schedule exception'),
  ('2026-10-23', null, 'No school'),
  ('2026-11-02', 'blue', 'Schedule exception'),
  ('2026-11-03', null, 'No school'),
  ('2026-11-04', 'white', 'Schedule exception'),
  ('2026-11-05', 'blue', 'Schedule exception'),
  ('2026-11-06', 'white', 'Schedule exception'),
  ('2026-11-23', 'blue', 'Schedule exception'),
  ('2026-11-24', 'white', 'Schedule exception'),
  ('2026-11-25', null, 'No school'),
  ('2026-11-26', null, 'No school'),
  ('2026-11-27', null, 'No school'),
  ('2026-12-16', 'blue', 'Schedule exception'),
  ('2026-12-17', 'white', 'Schedule exception');
