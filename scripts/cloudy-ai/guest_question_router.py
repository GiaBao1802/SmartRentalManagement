"""Safe deterministic responses for renter questions the public listing cannot answer."""
import re

from id_normalizer import normalized


def route(message):
    """Return a grounded renter-support reply, or None for the normal filter path."""
    text = normalized(message)
    explicit_search = re.search(r"\b(?:tim|thue phong|thue tro|muon thue|muon tim|can thue|can phong)\b", text)
    if re.search(r"\bnuoi\s+(?:meo|cho)\s+hoac\s+(?:nuoi\s+)?(?:meo|cho)\b", text):
        return (
            "Mình hiểu bạn đang tìm phòng có chính sách thú cưng, nhưng chưa rõ bạn nuôi mèo, nuôi chó "
            "hay cần chấp nhận cả hai. Vì bộ lọc chỉ giữ các chính sách được chủ trọ xác nhận, "
            "bạn chọn giúp mình một phương án nhé; mình chưa tìm phòng."
        )
    # Pet policy is a supported structured Room filter. Keep explicit room searches
    # for cats/dogs on the normal model path; a bare policy question is owner-specific.
    if explicit_search and re.search(r"\b(?:nuoi meo|nuoi cho)\b", text):
        return None

    if re.search(r"\b(?:ho boi|san bong|san the thao|cau long|tennis|gym)\b", text):
        if re.search(r"\b(?:phi|mat phi|bao nhieu tien|lich|may gio|mo cua|dat lich|con cho|suc chua|cho su dung)\b", text):
            topic = "giá, lịch và quyền sử dụng tiện ích chung"
            detail = "Tin công khai chỉ cho biết tên tiện ích chung; chưa có dữ liệu về phí, lịch, sức chứa hoặc lượt trống."
            return _owner_contact(topic, detail)
        return (
            "Mình hiểu bạn muốn tìm khu trọ có tiện ích chung như hồ bơi hoặc sân thể thao. "
            "Cloudy chat hiện chưa lọc tiện ích chung; bạn có thể chọn mục “Tiện ích chung của khu trọ” "
            "trong bộ lọc trên trang Danh sách. Tên tiện ích không xác nhận có chỗ trống, miễn phí hay lịch sử dụng."
        )

    groups = [
        (
            r"\b(?:tien coc|dat coc|coc|dien nuoc|dien voi nuoc|dien va nuoc|tien dien|tien nuoc|"
            r"tinh bao nhieu|"
            r"phi gui xe|gui xe.*(?:phi|mat)|tong cong|khoan nao nua|chi phi|bao gom)\b",
            "tiền cọc, tiền thuê hoặc các khoản phí",
            "Tin đăng công khai chưa xác nhận đủ khoản này; tiền thuê hiển thị không đồng nghĩa đã gồm điện nước hoặc phí gửi xe.",
        ),
        (
            r"\b(?:hop dong|tra phong|mat coc|dan ban|khach.*(?:qua dem|ngu lai)|ngu lai|qua dem|"
            r"nau an|gio gioi nghiem|gio dong cua|tam tru|dang ky cu tru|nuoi cho|nuoi meo)\b",
            "điều khoản hợp đồng hoặc nội quy khu trọ",
            "Cloudy chưa có điều khoản/nội quy đã xác nhận cho tin đăng này nên không thể kết luận thay chủ trọ.",
        ),
        (
            r"\b(?:ngap|an ninh|yen tinh|am moc|moc|sang ban ngay|hoi toi|toi om|toi den|bao ve|mai che|"
            r"toc do wifi|wifi manh|hop online|tang may|tang so may)\b",
            "đặc điểm thực tế hoặc chất lượng phòng/khu trọ",
            "Tin công khai không xác minh tình trạng thực tế, độ an ninh, độ ồn hay chất lượng thiết bị/mạng.",
        ),
        (
            r"\b(?:hong|hu|sua chua|ai sua|bao lau moi sua|bao tri|xu ly su co)\b",
            "trách nhiệm sửa chữa và thời gian xử lý",
            "Tin đăng công khai chưa có chính sách bảo trì hoặc thời gian phản hồi đã xác nhận.",
        ),
        (
            r"\b(?:xem phong|hen xem|dat lich xem|giu phong|giu cho|chuyen vao|"
            r"ngay nhan phong)\b",
            "lịch xem, giữ phòng hoặc ngày nhận phòng",
            "Cloudy chat chưa có lịch trống và không thể đặt lịch/giữ phòng; ngày nhận phòng cần chủ trọ xác nhận.",
        ),
    ]
    for pattern, topic, detail in groups:
        if re.search(pattern, text):
            return _owner_contact(topic, detail)

    if re.search(r"\b(?:sinh vien|phu hop|gia dinh|vo chong|em be)\b", text):
        return (
            "Mình chưa đủ thông tin để biết phòng có phù hợp nhu cầu của bạn không. "
            "Bạn muốn ưu tiên ngân sách, khu vực, số người ở hay tiện ích nào? "
            "Mình sẽ chỉ lọc theo dữ liệu công khai đã xác nhận."
        )

    if re.search(r"\b(?:cung khu tro|phong nao.*re hon)\b", text):
        return (
            "Mình hiểu bạn muốn so sánh phòng rẻ hơn trong cùng khu trọ, nhưng chưa biết phòng/khu trọ làm mốc. "
            "Bạn gửi mã hoặc mở tin phòng cụ thể để kiểm tra chi tiết; Cloudy chưa lọc danh sách theo tên khu trọ."
        )

    if re.search(r"\b(?:anh that|dung phong|phong nay|phong a\d+|phong b\d+|"
                 r"con khong|bao nhieu tien|rong bao nhieu|co phu hop)\b", text):
        return (
            "Mình hiểu bạn đang hỏi thông tin của một phòng cụ thể, nhưng chưa xác định được tin phòng nào "
            "hoặc không có đủ dữ liệu công khai để xác minh câu trả lời. Bạn mở chi tiết tin đăng để xem "
            "thông tin đã xác nhận; phần chưa hiển thị thì gửi yêu cầu liên hệ chủ trọ nhé."
        )
    return None


def _owner_contact(topic, detail):
    return (
        f"Mình hiểu bạn đang hỏi về {topic}. {detail} "
        "Bạn mở chi tiết tin phòng rồi gửi yêu cầu liên hệ để chủ trọ xác nhận nhé; "
        "mình chưa tự đoán thông tin hoặc thực hiện đặt lịch/giữ phòng."
    )
