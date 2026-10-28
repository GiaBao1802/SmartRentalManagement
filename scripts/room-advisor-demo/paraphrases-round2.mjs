// Frozen before the first round-2 inference. Missing/conflicting values require review.
export const round2Cases = [
  {id:'no-punctuation',note:'Mình ở 2 người tổng 4 triệu đi xe máy tới Trường A tối đa 30 phút cần nấu ăn và chỗ gửi xe ưu tiên rộng',expected:{budget:4000000,destination:'campus',mode:'motorbike',maxMinutes:30,people:2,priority:'space',required:['cooking','parking']}},
  {id:'alternative-transport',note:'Tổng 4 triệu, ở 1 người, tới Văn phòng B. Đi xe máy hoặc xe buýt đều được, tối đa 30 phút. Cần nấu ăn.',expected:{budget:4000000,destination:'office',mode:null,maxMinutes:30,people:1,required:['cooking']}},
  {id:'occupant-range',note:'Tổng 4 triệu, có thể ở 2 hoặc 3 người, tới Trường A bằng xe máy tối đa 20 phút. Cần chỗ để xe.',expected:{budget:4000000,destination:'campus',mode:'motorbike',maxMinutes:20,people:null,required:['parking']}},
  {id:'mixed-amenities',note:'Tổng 4 triệu, ở 1 người, tới Văn phòng B bằng xe máy tối đa 25 phút. Cần nấu ăn không cần máy lạnh.',expected:{budget:4000000,destination:'office',mode:'motorbike',maxMinutes:25,people:1,required:['cooking']}},
];
