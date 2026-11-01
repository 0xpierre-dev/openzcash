"""Checks for the public monthly task validator."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from reports.monthly.check_monthly_standard import verify_automation


SAMPLE_AUTOMATION = '''
id = "sample-monthly"
kind = "heartbeat"
status = "ACTIVE"
rrule = "FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0;BYSECOND=0"
target_thread_id = "sample-thread"
prompt = "Prepare a reviewed monthly reading set."
'''


class AutomationValidationTest(unittest.TestCase):
    def test_public_check_does_not_disclose_private_identity_or_prompt(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'automation.toml'
            path.write_text(SAMPLE_AUTOMATION)
            result = verify_automation(path)

        self.assertTrue(result['cadenceVerified'])
        self.assertFalse(result['idVerified'])
        self.assertFalse(result['targetVerified'])
        self.assertFalse(result['promptVerified'])
        self.assertNotIn('sample-monthly', str(result))
        self.assertNotIn('sample-thread', str(result))

    def test_private_expectations_can_verify_exact_task(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'automation.toml'
            expected = Path(directory) / 'expected-prompt.txt'
            path.write_text(SAMPLE_AUTOMATION)
            expected.write_text('Prepare a reviewed monthly reading set.\n')
            result = verify_automation(path, 'sample-monthly', 'sample-thread', expected)
            self.assertTrue(result['idVerified'])
            self.assertTrue(result['targetVerified'])
            self.assertTrue(result['promptVerified'])

            with self.assertRaisesRegex(ValueError, 'does not match'):
                verify_automation(path, expected_target_thread_id='other-thread')


if __name__ == '__main__':
    unittest.main()
