import json
import random
from datetime import datetime, timedelta
import re
from faker import Faker
from bson.objectid import ObjectId

# Khởi tạo Faker
fake = Faker()

# Hàm tạo slug từ tên
def create_slug(name):
    slug = name.lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    return slug

# Hàm tạo orderNumber
def generate_order_number():
    return f"ORD-{random.randint(10000000, 99999999)}"

# Hàm tạo SKU
def generate_sku():
    return f"SKU-{random.randint(1000, 9999)}-{random.choice(['A', 'B', 'C'])}"

# Hàm tạo địa chỉ
def generate_address():
    return {
        "fullName": fake.name(),
        "address": fake.street_address(),
        "city": fake.city(),
        "state": fake.state(),
        "zipCode": fake.zipcode(),
        "country": random.choice(["Vietnam", "Thailand", "Malaysia", "Singapore", "Indonesia", "Philippines"])
    }

# 1. Tạo dữ liệu cho users
def generate_user(email_set):
    email = fake.email()
    while email in email_set:
        email = fake.email()
    email_set.add(email)
    return {
        "_id": str(ObjectId()),
        "email": email,
        "name": fake.name(),
        "profile": {
            "age": random.randint(13, 80) if random.choice([True, False]) else None,
            "country": random.choice(["Vietnam", "Thailand", "Malaysia", "Singapore", "Indonesia", "Philippines"]),
            "interests": fake.words(nb=random.randint(0, 5)) if random.choice([True, False]) else [],
            "avatar": fake.image_url() if random.choice([True, False]) else None
        },
        "status": random.choice(["active", "inactive", "suspended"]),
        "lastLogin": fake.date_time_between(start_date="-1y", end_date="now").isoformat() if random.choice([True, False]) else None,
        "createdAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat(),
        "updatedAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat()
    }

# 2. Tạo dữ liệu cho categories
def generate_category(slug_set, parent_id=None, level=0, max_levels=3):
    name = fake.word().capitalize() + " " + fake.word().capitalize()
    slug = create_slug(name)
    while slug in slug_set:
        slug = f"{slug}-{random.randint(1000, 9999)}"
    slug_set.add(slug)
    return {
        "_id": str(ObjectId()),
        "name": name,
        "slug": slug,
        "description": fake.text(max_nb_chars=200),
        "parentId": parent_id if parent_id else None,
        "image": fake.image_url(),
        "sortOrder": random.randint(0, 100),
        "featured": random.choice([True, False]),
        "status": random.choice(["active", "inactive"]),
        "seo": {
            "metaTitle": fake.sentence(nb_words=6)[:60],
            "metaDescription": fake.text(max_nb_chars=160),
            "keywords": fake.words(nb=random.randint(3, 8))
        },
        "createdAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat(),
        "updatedAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat()
    }

# 3. Tạo dữ liệu cho products
def generate_product(sku_set):
    sku = generate_sku()
    while sku in sku_set:
        sku = generate_sku()
    sku_set.add(sku)
    return {
        "_id": str(ObjectId()),
        "sku": sku,
        "name": fake.word().capitalize() + " " + fake.word().capitalize() + " Product",
        "description": fake.text(max_nb_chars=500),
        "category": random.choice(["electronics", "clothing", "books", "home", "sports", "beauty", "toys", "automotive"]),
        "subcategory": fake.word().capitalize() if random.choice([True, False]) else None,
        "price": round(random.uniform(10, 500), 2),
        "currency": random.choice(["USD", "VND", "EUR", "GBP"]),
        "inventory": {
            "quantity": random.randint(0, 1000),
            "reserved": random.randint(0, 50),
            "lowStockThreshold": random.randint(5, 20)
        },
        "images": [fake.image_url() for _ in range(random.randint(1, 5))],
        "tags": fake.words(nb=random.randint(0, 10)),
        "specifications": {
            "weight": f"{random.uniform(0.1, 10):.2f} kg",
            "color": random.choice(["Red", "Blue", "Green", "Black", "White"]),
            "brand": fake.company()
        },
        "ratings": {
            "average": round(random.uniform(0, 5), 1) if random.choice([True, False]) else 0,
            "count": random.randint(0, 100)
        },
        "status": random.choice(["active", "inactive", "discontinued", "draft"]),
        "createdAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat(),
        "updatedAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat()
    }

# 4. Tạo dữ liệu cho product_categories
def generate_product_category(product_id, category_id):
    return {
        "_id": str(ObjectId()),
        "productId": product_id,
        "categoryId": category_id,
        "isPrimary": random.choice([True, False]),
        "sortOrder": random.randint(0, 100),
        "createdAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat()
    }

# 5. Tạo dữ liệu cho orders
def generate_order_item(product):
    quantity = random.randint(1, 5)
    price = product.get("price", round(random.uniform(10, 500), 2))
    return {
        "productId": str(product["_id"]),
        "sku": product.get("sku"),
        "name": product.get("name"),
        "price": price,
        "quantity": quantity,
        "subtotal": round(price * quantity, 2)
    }

def generate_order(customer_ids, products, order_number_set):
    order_number = generate_order_number()
    while order_number in order_number_set:
        order_number = generate_order_number()
    order_number_set.add(order_number)
    
    num_items = random.randint(1, 5)
    selected_products = random.sample(products, min(num_items, len(products)))
    items = [generate_order_item(product) for product in selected_products]
    
    subtotal = sum(item["subtotal"] for item in items)
    tax = round(subtotal * random.uniform(0, 0.1), 2)
    shipping = round(random.uniform(0, 50), 2)
    discount = round(subtotal * random.uniform(0, 0.2), 2)
    total_amount = round(subtotal + tax + shipping - discount, 2)
    
    order_date = fake.date_time_between(start_date="-2y", end_date="now")
    status = random.choice(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"])
    
    return {
        "_id": str(ObjectId()),
        "orderNumber": order_number,
        "customerId": random.choice(customer_ids),
        "items": items,
        "shippingAddress": generate_address(),
        "billingAddress": generate_address(),
        "payment": {
            "method": random.choice(["credit_card", "debit_card", "paypal", "bank_transfer", "cash_on_delivery"]),
            "status": random.choice(["pending", "completed", "failed", "refunded"]),
            "transactionId": f"TXN-{random.randint(1000, 9999)}",
            "amount": total_amount
        },
        "subtotal": subtotal,
        "tax": tax,
        "shipping": shipping,
        "discount": discount,
        "totalAmount": total_amount,
        "currency": random.choice(["USD", "VND", "EUR", "GBP"]),
        "status": status,
        "orderDate": order_date.isoformat(),
        "shippedDate": (order_date + timedelta(days=random.randint(1, 5))).isoformat() if status in ["shipped", "delivered"] else None,
        "deliveredDate": (order_date + timedelta(days=random.randint(5, 10))).isoformat() if status == "delivered" else None,
        "notes": fake.sentence(nb_words=10)[:200] if random.choice([True, False]) else "",
        "createdAt": order_date.isoformat(),
        "updatedAt": order_date.isoformat()
    }

# 6. Tạo dữ liệu cho product_reviews
def generate_product_review(product_id, user_id, order_products, product_user_pairs):
    if (product_id, user_id) in product_user_pairs:
        return None  # Tránh trùng lặp productId và userId
    product_user_pairs.add((product_id, user_id))
    verified = product_id in order_products.get(user_id, [])
    return {
        "_id": str(ObjectId()),
        "productId": product_id,
        "userId": user_id,
        "rating": random.randint(1, 5),
        "title": fake.sentence(nb_words=6)[:100],
        "content": fake.text(max_nb_chars=500),
        "verified": verified,
        "helpful": {
            "yes": random.randint(0, 50),
            "no": random.randint(0, 20)
        },
        "status": random.choice(["pending", "approved", "rejected", "spam"]),
        "images": [fake.image_url() for _ in range(random.randint(0, 3))],
        "createdAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat(),
        "updatedAt": fake.date_time_between(start_date="-2y", end_date="now").isoformat()
    }

# Hàm lưu dữ liệu vào file JSON
def save_to_json(data, filename):
    with open(filename, 'w', encoding='utf-8') as f:
        # Lưu mỗi bản ghi trên một dòng (định dạng JSONL)
        for record in data:
            json.dump(record, f, ensure_ascii=False)
            f.write('\n')
    print(f"Đã lưu {len(data)} bản ghi vào {filename}")

# Main
if __name__ == "__main__":
    # 1. Tạo 10,000 users
    email_set = set()
    users = [generate_user(email_set) for _ in range(10000)]
    user_ids = [user["_id"] for user in users]
    save_to_json(users, "users.json")

    # 2. Tạo 10,000 categories với cấu trúc phân cấp
    slug_set = set()
    categories = []
    level_counts = {0: 100}  # Root categories
    max_levels = 3
    remaining = 10000 - level_counts[0]
    for level in range(1, max_levels):
        level_counts[level] = min(remaining // (max_levels - level), random.randint(50, 200))
        remaining -= level_counts[level]
    
    for _ in range(level_counts[0]):
        categories.append(generate_category(slug_set))
    
    for level in range(1, max_levels):
        parent_ids = [cat["_id"] for cat in categories if cat["parentId"] is None] if level == 1 else [cat["_id"] for cat in categories]
        if not parent_ids:
            break
        level_categories = [generate_category(slug_set, parent_id=random.choice(parent_ids), level=level) for _ in range(level_counts[level])]
        categories.extend(level_categories)
    
    if len(categories) < 10000:
        additional = [generate_category(slug_set) for _ in range(10000 - len(categories))]
        categories.extend(additional)
    category_ids = [cat["_id"] for cat in categories]
    save_to_json(categories, "categories.json")

    # 3. Tạo 10,000 products
    sku_set = set()
    products = [generate_product(sku_set) for _ in range(10000)]
    product_ids = [prod["_id"] for prod in products]
    save_to_json(products, "products.json")

    # 4. Tạo product_categories (2-3 categories mỗi product)
    product_categories = []
    product_category_pairs = set()
    for product_id in product_ids:
        num_categories = random.randint(1, 3)
        selected_categories = random.sample(category_ids, min(num_categories, len(category_ids)))
        is_primary_set = False
        for category_id in selected_categories:
            if (product_id, category_id) not in product_category_pairs:
                product_category = generate_product_category(product_id, category_id)
                product_category_pairs.add((product_id, category_id))
                if not is_primary_set and random.choice([True, False]):
                    product_category["isPrimary"] = True
                    is_primary_set = True
                product_categories.append(product_category)
    save_to_json(product_categories, "product_categories.json")

    # 5. Tạo 10,000 orders
    order_number_set = set()
    orders = [generate_order(user_ids, products, order_number_set) for _ in range(10000)]
    save_to_json(orders, "orders.json")

    # 6. Tạo 10,000 product_reviews
    order_products = {}
    for order in orders:
        customer_id = order["customerId"]
        for item in order["items"]:
            if customer_id not in order_products:
                order_products[customer_id] = []
            order_products[customer_id].append(item["productId"])
    
    product_reviews = []
    product_user_pairs = set()
    while len(product_reviews) < 10000:
        user_id = random.choice(user_ids)
        product_id = random.choice(product_ids)
        review = generate_product_review(product_id, user_id, order_products, product_user_pairs)
        if review:
            product_reviews.append(review)
    save_to_json(product_reviews, "product_reviews.json")