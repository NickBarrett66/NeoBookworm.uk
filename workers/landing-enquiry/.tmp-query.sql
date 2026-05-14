SELECT notion_id, business_name, contact_name, email_address, status, town
FROM prospects
WHERE contact_name = 'MainOption3' OR business_name = 'MainOption3'
LIMIT 10;
