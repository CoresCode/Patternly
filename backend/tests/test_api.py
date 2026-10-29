import json
import socket
import sys
import threading
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app

CSV = "x,y,label\n0,0,a\n0.1,0.2,a\n-0.1,-0.1,a\n10,10,b\n10.1,9.9,b\n9.8,10.2,b\n"


def multipart(file_text: str, filename: str = "sample.csv") -> tuple[bytes, str]:
    boundary = "----PatternlyTestBoundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: text/csv\r\n\r\n"
        f"{file_text}\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    return body, f"multipart/form-data; boundary={boundary}"


class PatternlyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=cls.port, log_level="error"))
        cls.thread = threading.Thread(target=cls.server.run, daemon=True)
        cls.thread.start()
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                with urlopen(f"{cls.base}/health", timeout=0.5):
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("Patternly API did not start")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.should_exit = True
        cls.thread.join(timeout=5)

    def post_csv(self, endpoint: str, file_text: str = CSV) -> dict:
        body, content_type = multipart(file_text)
        request = Request(f"{self.base}{endpoint}", data=body, headers={"Content-Type": content_type}, method="POST")
        with urlopen(request, timeout=5) as response:
            return json.loads(response.read())

    def test_health_check(self) -> None:
        with urlopen(f"{self.base}/health", timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read())["status"], "ok")

    def test_inspects_csv_shape_and_numeric_features(self) -> None:
        result = self.post_csv("/api/dataset/inspect")
        self.assertEqual((result["rows"], result["columns"]), (6, 3))
        self.assertEqual([col["name"] for col in result["column_info"] if col["numeric"]], ["x", "y"])
        self.assertEqual(len(result["preview"]), 6)

    def test_bundled_sample_dataset_can_be_inspected(self) -> None:
        sample_path = Path(__file__).resolve().parents[2] / "public" / "mini-flowers.csv"
        result = self.post_csv("/api/dataset/inspect", sample_path.read_text(encoding="utf-8-sig"))
        self.assertEqual(result["rows"], 20)
        self.assertIn("petal_length", [col["name"] for col in result["column_info"]])

    def test_runs_kmeans_and_returns_two_groups(self) -> None:
        result = self.post_csv("/api/cluster?algorithm=kmeans&features=x%2Cy&clusters=2")
        self.assertEqual(result["algorithm"], "kmeans")
        self.assertEqual(result["cluster_count"], 2)
        self.assertEqual(len(result["labels"]), 6)
        self.assertEqual(sum(result["cluster_counts"].values()), 6)

    def test_runs_dbscan_and_returns_assignments(self) -> None:
        result = self.post_csv("/api/cluster?algorithm=dbscan&features=x%2Cy&eps=0.5&min_samples=2")
        self.assertEqual(result["algorithm"], "dbscan")
        self.assertEqual(len(result["labels"]), 6)
        self.assertGreaterEqual(result["cluster_count"], 1)

    def test_rejects_csv_without_enough_columns(self) -> None:
        body, content_type = multipart("value\n1\n2\n")
        request = Request(f"{self.base}/api/dataset/inspect", data=body, headers={"Content-Type": content_type}, method="POST")
        with self.assertRaises(HTTPError) as error:
            urlopen(request, timeout=5)
        self.assertEqual(error.exception.code, 400)
        self.assertIn("at least two columns", error.exception.read().decode())


if __name__ == "__main__":
    unittest.main()
