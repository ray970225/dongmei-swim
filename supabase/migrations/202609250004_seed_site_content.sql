-- Transfer the seven manually maintained 2026 honours from Firebase and
-- retain the four public training groups currently written in index.html.
insert into public.site_honours (legacy_id, cat, event, name, year, items) values
  ('6nNztcoRAqrvP7fC046J', '全國', '全國中等學校運動會', '李瀚', 2026,
    array['200公尺自由式 1:50.12 第1名','50公尺自由式 23.60 第2名','100公尺自由式 50.60 第2名']),
  ('HLUBUp3PSKjpTAXzURzx', '全國', '全國中等學校運動會', '胡閔惟', 2026,
    array['100公尺仰式 59.28 第4名','200公尺仰式 2:09.65 第4名','200公尺混合式 2:21.00 第8名']),
  ('HZQ3WBneEBeN12NkwTkc', '全國', '全國中等學校運動會', '李曄、郭叡、胡閔惟、李瀚', 2026,
    array['4×100公尺自由式接力 3:27.93 第2名']),
  ('HfXjlafPxiMNueyoGINF', '全國', '全國中等學校運動會', '李曄、郭叡、胡閔惟、李瀚', 2026,
    array['4×100公尺混合式接力 3:54.65 第2名']),
  ('j4A9xC3jKkGgPM0FZYE6', '全國', '全國中等學校運動會', '李曄、胡閔惟、郭叡、李瀚', 2026,
    array['4×200公尺自由式接力 7:36.57 (破大會紀錄) 第2名']),
  ('rad2FhocUEyaHf57dLBO', '全國', '全國中等學校運動會', '李曄', 2026,
    array['50公尺仰式 27.22 第3名','100公尺仰式 59.27 第3名']),
  ('v77GGTm4LRN7NLLddj2V', '全國', '全國中等學校運動會', '郭叡', 2026,
    array['200公尺混合式 2:19.79 第7名','200公尺自由式 1:58.55 第7名','1500公尺自由式 17:07.64 第8名'])
on conflict (legacy_id) do update set cat = excluded.cat, event = excluded.event,
  name = excluded.name, year = excluded.year, items = excluded.items, updated_at = now();

insert into public.recruitment_classes (legacy_id, name, age, "desc", sort_order) values
  ('index-group-cub', '🐟 幼熊組（兒童初階）', '5 - 10 歲', '先決條件：必須能夠以自由式和仰式游 25 公尺。讓孩子知道游泳是一種樂趣，並學習競技游泳基礎，包括四種泳姿及發展競技游泳所需的技能。適合剛完成初學課程的初學者，目標逐步參加游泳比賽並進入下一個級別。', 10),
  ('index-group-blue-bear', '🐠 藍熊組（兒童進階）', '10 歲及以下', '具備比賽經驗，能完成四種泳姿項目與比賽規則要求的技能。此階段加強出發、轉身和心理技能，培養自我挑戰與團隊合作。', 20),
  ('index-group-red-bear', '🐬 紅熊組', '10 - 12 歲', '更加重視培訓與目標設定，選手需對自己的進步與努力負責。穩定出席訓練，持續精進游泳技巧與打腿能力，並加強出發、轉身和心理技能，為下一級訓練做準備。', 30),
  ('index-group-yellow-bear', '🦈 黃熊組', '13 歲及以上；11 - 12 歲由教練評估同意', '提供游泳技術指導與四種競賽泳訓練，持續加強技巧、出發與轉身技術。以全國大賽為目標，採系統化訓練計畫，安排週六加練與影像分析回饋，協助選手挑戰個人最佳成績。', 40)
on conflict (legacy_id) do update set name = excluded.name, age = excluded.age,
  "desc" = excluded."desc", sort_order = excluded.sort_order, updated_at = now();
