import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../cubit/outages_cubit.dart';
import '../models/outage.dart';
import 'settings_screen.dart';

class OutagesScreen extends StatelessWidget {
  const OutagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ISECO Outages'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () async {
              final result = await Navigator.push<List<String>>(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
              if (result != null && context.mounted) {
                context.read<OutagesCubit>().setWatchedBarangays(result);
              }
            },
          ),
        ],
      ),
      body: BlocBuilder<OutagesCubit, OutagesState>(
        builder: (context, state) {
          return switch (state) {
            OutagesLoading() => const Center(child: CircularProgressIndicator()),
            OutagesError(:final message) => _ErrorView(
                message: message,
                onRetry: () => context.read<OutagesCubit>().fetchOutages(),
              ),
            OutagesEmpty() => _EmptyView(
                onRefresh: () => context.read<OutagesCubit>().fetchOutages(),
              ),
            OutagesLoaded(:final filteredOutages, :final watchedBarangays) =>
              filteredOutages.isEmpty && watchedBarangays.isNotEmpty
                  ? _EmptyFilteredView(
                      onRefresh: () =>
                          context.read<OutagesCubit>().fetchOutages(),
                    )
                  : RefreshIndicator(
                      onRefresh: () =>
                          context.read<OutagesCubit>().fetchOutages(),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: filteredOutages.length,
                        itemBuilder: (context, index) {
                          final outage = filteredOutages[index];
                          final affectsYou = watchedBarangays.isNotEmpty &&
                              watchedBarangays.any(outage.affectsBarangay);
                          return _OutageCard(
                            outage: outage,
                            affectsYou: affectsYou,
                          );
                        },
                      ),
                    ),
          };
        },
      ),
    );
  }
}

class _OutageCard extends StatelessWidget {
  const _OutageCard({required this.outage, this.affectsYou = false});

  final Outage outage;
  final bool affectsYou;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('EEE, MMM d, yyyy');
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.bolt, color: theme.colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    dateFmt.format(outage.outageDate),
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ),
                if (affectsYou)
                  Chip(
                    label: const Text('Affects you'),
                    backgroundColor: theme.colorScheme.errorContainer,
                    labelStyle: TextStyle(
                      color: theme.colorScheme.onErrorContainer,
                      fontSize: 12,
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${_formatTime(outage.startTime)} – ${_formatTime(outage.endTime)}',
              style: theme.textTheme.bodyLarge,
            ),
            if (outage.isDistrictWide) ...[
              const SizedBox(height: 8),
              Text(
                'District-wide outage',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: outage.areas
                  .map((a) => Chip(label: Text(a), visualDensity: VisualDensity.compact))
                  .toList(),
            ),
            if (outage.exclusions.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Except: ${outage.exclusions.join(', ')}',
                style: theme.textTheme.bodySmall,
              ),
            ],
            if (outage.purpose != null && outage.purpose!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(outage.purpose!, style: theme.textTheme.bodyMedium),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(String time) {
    final parts = time.split(':');
    if (parts.length < 2) return time;
    final hour = int.tryParse(parts[0]) ?? 0;
    final minute = parts[1];
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final h12 = hour % 12 == 0 ? 12 : hour % 12;
    return '$h12:$minute $ampm';
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_outline,
              size: 64, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          const Text('No outages scheduled', style: TextStyle(fontSize: 18)),
          const SizedBox(height: 8),
          const Text('Pull down to refresh'),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh'),
          ),
        ],
      ),
    );
  }
}

class _EmptyFilteredView extends StatelessWidget {
  const _EmptyFilteredView({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.filter_list_off, size: 64),
          const SizedBox(height: 16),
          const Text('No outages match your areas'),
          const SizedBox(height: 8),
          const Text('Try clearing filters in Settings'),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh'),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
