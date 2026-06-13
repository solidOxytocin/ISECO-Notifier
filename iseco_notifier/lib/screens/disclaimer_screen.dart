import 'package:flutter/material.dart';

class DisclaimerScreen extends StatelessWidget {
  const DisclaimerScreen({super.key, required this.onAccept});

  final VoidCallback onAccept;

  static const officialFbUrl =
      'https://www.facebook.com/ISECO.Official';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Disclaimer')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.info_outline, size: 48),
            const SizedBox(height: 16),
            Text(
              'Unofficial App',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            const Text(
              'ISECO Notifier is not affiliated with, endorsed by, or operated by '
              'Ilocos Sur Electric Cooperative, Inc. (ISECO).\n\n'
              'Outage information is sourced from public Facebook posts and may be '
              'delayed or incomplete. Always verify schedules on the official ISECO page.\n\n'
              'By continuing, you agree to use this app at your own discretion.',
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () {
                // User can open official page in browser
              },
              child: const Text('Official ISECO Facebook Page'),
            ),
            const Spacer(),
            FilledButton(
              onPressed: onAccept,
              child: const Text('I Understand'),
            ),
          ],
        ),
      ),
    );
  }
}
