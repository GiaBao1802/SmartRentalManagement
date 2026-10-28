// Expectations fixed before the first inference; approximate values need confirmation.
export const round3Cases=[
 {id:'compound-money',note:'Tổng ba triệu năm trăm nghìn mỗi tháng, ở hai người, cần nấu ăn.',expected:{budget:3500000,people:2,required:['cooking']}},
 {id:'approximate-budget',note:'Ngân sách khoảng ba triệu, ở một người, cần chỗ để xe.',expected:{budget:null,people:1,required:['parking']}},
 {id:'more-than-two',note:'Tổng bốn triệu, ở hơn hai người, cần nấu ăn.',expected:{budget:4000000,people:null,required:['cooking']}},
 {id:'approximate-time',note:'Tổng bốn triệu, ở một người, tới Văn phòng B bằng xe máy khoảng hai mươi phút.',expected:{budget:4000000,people:1,destination:'office',mode:'motorbike',maxMinutes:null}},
];
