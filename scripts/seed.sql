-- Fictional data for local development only. Do not apply this file to a production database.
INSERT INTO athletes (id,name,gender,birth_date) VALUES ('athlete-demo','サンプル選手','male','2012-01-01');
INSERT INTO races (id,athlete_id,race_date,meet_name,course,event,record_centis,rt_centis,rank) VALUES
('race-1','athlete-demo','2025-01-12','サンプル記録会A','SCM','100m 自由形',5824,68,2),
('race-2','athlete-demo','2024-12-08','サンプル記録会B','SCM','100m 自由形',5901,71,4);
INSERT INTO splits (id,race_id,leg_number,distance_m,time_centis) VALUES ('split-1','race-1',1,50,2801),('split-2','race-1',2,100,3023);
INSERT INTO qualification_standards (id,system,gender,min_age,max_age,course,event,label,target_centis) VALUES
('jo-1','JO','male',13,14,'SCM','100m 自由形','JO標準',5750),('grade-1','grade','male',13,14,'SCM','100m 自由形','10級',5900);
