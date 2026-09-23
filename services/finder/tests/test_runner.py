import base64
import json
from pathlib import Path
import unittest

from finder.runner.api_client import sign_request
from finder.runner.queue_client import PulledMessage, decode_queue_body, parse_pull_response
from finder.runner.runner import ExternalFinderRunner, env_config, load_local_environment


class RunnerTests(unittest.TestCase):
    class Queue:
        def __init__(self, messages):
            self.messages = messages
            self.retried = []

        def pull_once(self, **_kwargs):
            return self.messages

        def retry(self, lease_id, **kwargs):
            self.retried.append((lease_id, kwargs))

    def test_runner_can_restrict_pull_to_one_job_id(self):
        queue = self.Queue([PulledMessage("message", "lease", 1, {"version": 1, "jobId": "other", "organizationId": "org"})])
        runner = ExternalFinderRunner(queue, object())
        with self.assertRaisesRegex(RuntimeError, "otro job"):
            runner.pull_once(expected_job_id="wanted")
        self.assertEqual(queue.retried, [("lease", {"delay_seconds": 30})])

    def test_runner_can_require_a_matching_job_message(self):
        runner = ExternalFinderRunner(self.Queue([]), object())
        with self.assertRaisesRegex(RuntimeError, "No se encontró"):
            runner.pull_once(expected_job_id="wanted", require_job=True)

    def test_runner_acks_invalid_message_but_fails_required_job(self):
        class InvalidQueue(self.Queue):
            def __init__(self):
                super().__init__([PulledMessage("message", "lease", 1, {"version": 1, "jobId": "", "organizationId": ""})])
                self.acked = []

            def ack(self, lease_id):
                self.acked.append(lease_id)

        queue = InvalidQueue()
        runner = ExternalFinderRunner(queue, object())
        with self.assertRaisesRegex(RuntimeError, "inválido"):
            runner.pull_once(expected_job_id="wanted", require_job=True)
        self.assertEqual(queue.acked, ["lease"])

    def test_cloudflare_json_body_is_base64_decoded(self):
        encoded = base64.b64encode(json.dumps({"version": 1, "jobId": "job", "organizationId": "org"}).encode()).decode()
        messages = parse_pull_response({"success": True, "result": {"messages": [{"id": "m", "lease_id": "l", "attempts": 1, "body": encoded, "metadata": {"CF-Content-Type": "json"}}]}})
        self.assertEqual(messages[0].payload["jobId"], "job")

    def test_json_body_can_be_direct_json_string(self):
        messages = parse_pull_response({"result": {"messages": [{"id": "m", "lease_id": "l", "body": '{"version":1,"jobId":"job","organizationId":"org"}', "metadata": {"CF-Content-Type": "json"}}]}})
        self.assertEqual(messages[0].payload["organizationId"], "org")

    def test_json_body_can_be_structured(self):
        self.assertEqual(decode_queue_body({"jobId": "job"}, "json"), {"jobId": "job"})

    def test_text_body_is_not_base64_decoded(self):
        self.assertEqual(decode_queue_body('{"ok":true}', "text"), {"ok": True})
        self.assertEqual(decode_queue_body("plain text", "text"), "plain text")

    def test_bytes_body_decodes_base64_without_json_heuristics(self):
        encoded = base64.b64encode(b'{"jobId":"job"}')
        self.assertEqual(decode_queue_body(encoded, "bytes"), b'{"jobId":"job"}')

    def test_invalid_base64_fails_cleanly(self):
        with self.assertRaisesRegex(ValueError, "neither JSON nor valid base64 JSON"):
            decode_queue_body("not-json!", "json")

    def test_v8_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported"):
            decode_queue_body("payload", "v8")

    def test_metadata_content_type_alias_is_supported(self):
        messages = parse_pull_response({"result": {"messages": [{"id": "m", "lease_id": "l", "body": '{"ok":true}', "metadata": {"cf_content_type": "json"}}]}})
        self.assertTrue(messages[0].payload["ok"])

    def test_signature_is_stable_for_fixed_timestamp(self):
        timestamp, signature = sign_request("POST", "/internal/finder/jobs/job/claim", "{}", "secret", 1700000000)
        self.assertEqual(timestamp, "1700000000")
        self.assertEqual(len(signature), 64)

    def test_signature_matches_shared_hmac_vector(self):
        timestamp, signature = sign_request(
            "POST",
            "/internal/finder/jobs/job-test/claim",
            '{"organizationId":"org-test"}',
            "fixture-secret",
            1700000000,
        )
        self.assertEqual(timestamp, "1700000000")
        self.assertEqual(signature, "aed158d4fb877cd07bac1361fcabd7d7d983e05673013ebcca18aba56b05fe1c")

    def test_runner_requires_separate_credentials(self):
        with self.assertRaisesRegex(RuntimeError, "CF_QUEUES_API_TOKEN"):
            env_config({"CORSTENO_API_BASE_URL": "https://api.corsteno.com"}, Path("tmp/nonexistent-finder.env"))

    def test_local_env_is_fallback_and_does_not_override_explicit_values(self):
        path = Path("tmp/test-finder.env.local")
        path.parent.mkdir(exist_ok=True)
        path.write_text("CF_ACCOUNT_ID=from-file\nFINDER_SERVICE_SECRET=file-secret\n", encoding="utf-8")
        try:
            values = load_local_environment({"CF_ACCOUNT_ID": "from-process"}, path)
            self.assertEqual(values["CF_ACCOUNT_ID"], "from-process")
            self.assertEqual(values["FINDER_SERVICE_SECRET"], "file-secret")
        finally:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
