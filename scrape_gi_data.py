# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx",
#     "beautifulsoup4",
#     "pydantic",
# ]
# ///

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, ValidationError, field_validator
from typing import Any
import csv
import sys

class GIEntry(BaseModel):
    food_name: str = Field(alias="Food Name")
    gi: str = Field(alias="GI")
    manufacturer: str = Field(alias="Food Manufacturer")
    category: str = Field(alias="Product Category")
    country: str = Field(alias="Country of food production")
    serving_size: str = Field(alias="Serving Size (g)")
    carbs_portion: str = Field(alias="Carbohydrate portion (g) or Average Carbohydrate portion (g)")
    gl: str = Field(alias="GL")
    reference: str = Field(alias="Reference:")
    subjects_type: str = Field(alias="Subjects type")
    time: str = Field(alias="Time")
    subjects_number: str = Field(alias="Subjects Number")
    year: str = Field(alias="Year of test")

    @field_validator("*", mode="before")
    @classmethod
    def empty_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return ""
        return v

def main():
    url = "https://glycemicindex.com/gi-search/"
    print(f"Downloading data from {url}...")

    headers_req = {"User-Agent": "curl/7.81.0"}

    try:
        # Using a client to handle redirects and headers properly
        with httpx.Client(follow_redirects=True, headers=headers_req, timeout=30.0) as client:
            response = client.get(url)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(f"HTTP error occurred: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

    soup = BeautifulSoup(response.text, 'html.parser')
    table = soup.find('table', id='tablepress-1')

    if not table:
        print("Error: Could not find table with id='tablepress-1' in the HTML.")
        # Some sites use data-tables that load late. Checking if there's any table at all.
        tables = soup.find_all("table")
        if tables:
            print(f"Found {len(tables)} other tables. Re-check the table ID if needed.")
        sys.exit(1)

    # Extract headers
    thead = table.find("thead")
    if not thead or not hasattr(thead, "find_all"):
        print("Error: Table has no thead or it is malformed.")
        sys.exit(1)

    header_cells = thead.find_all('th')
    column_names = [th.get_text(strip=True) for th in header_cells]

    print(f"Found columns: {column_names}")

    entries = []
    tbody = table.find("tbody")
    if not tbody or not hasattr(tbody, "find_all"):
        print("Error: Table has no tbody or it is malformed.")
        sys.exit(1)

    rows = tbody.find_all("tr")
    print(f"Processing {len(rows)} rows...")

    for row in rows:
        if not hasattr(row, "find_all"):
            continue
        cells = row.find_all("td")
        if not cells:
            continue

        data = [cell.get_text(strip=True) for cell in cells]

        # Ensure we have enough data for all columns
        if len(data) < len(column_names):
            # Pad with empty strings if some columns are missing in a row
            data.extend([""] * (len(column_names) - len(data)))
        elif len(data) > len(column_names):
            data = data[: len(column_names)]

        row_dict = dict(zip(column_names, data))

        try:
            # Validate with Pydantic
            entry = GIEntry(**row_dict)
            entries.append(entry.model_dump(by_alias=True))
        except ValidationError as e:
            print(f"Validation failed for row: {data[0] if data else 'Unknown'}")
            print(e)
            continue

    if not entries:
        print("No valid entries found.")
        sys.exit(0)

    output_csv = "gi_data.csv"
    try:
        with open(output_csv, 'w', newline='', encoding='utf-8') as f:
            # Use column_names as they are the aliases in our model
            writer = csv.DictWriter(f, fieldnames=column_names)
            writer.writeheader()
            writer.writerows(entries)
        print(f"Successfully saved {len(entries)} entries to {output_csv}")
    except Exception as e:
        print(f"Failed to save CSV: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
