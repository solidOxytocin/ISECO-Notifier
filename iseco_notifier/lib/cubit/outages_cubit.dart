import 'package:flutter_bloc/flutter_bloc.dart';

import '../models/outage.dart';
import '../services/supabase_service.dart';

sealed class OutagesState {}

class OutagesLoading extends OutagesState {}

class OutagesLoaded extends OutagesState {
  OutagesLoaded(this.outages, {this.watchedBarangays = const []});

  final List<Outage> outages;
  final List<String> watchedBarangays;

  List<Outage> get filteredOutages {
    if (watchedBarangays.isEmpty) return outages;
    return outages
        .where((o) => watchedBarangays.any(o.affectsBarangay))
        .toList();
  }
}

class OutagesEmpty extends OutagesState {}

class OutagesError extends OutagesState {
  OutagesError(this.message);
  final String message;
}

class OutagesCubit extends Cubit<OutagesState> {
  OutagesCubit(this._supabase) : super(OutagesLoading());

  final SupabaseService _supabase;
  List<String> _watchedBarangays = [];

  void setWatchedBarangays(List<String> barangays) {
    _watchedBarangays = barangays;
    if (state is OutagesLoaded) {
      emit(OutagesLoaded((state as OutagesLoaded).outages,
          watchedBarangays: barangays));
    }
  }

  Future<void> fetchOutages() async {
    emit(OutagesLoading());
    try {
      final outages = await _supabase.fetchUpcomingOutages();
      if (outages.isEmpty) {
        emit(OutagesEmpty());
      } else {
        emit(OutagesLoaded(outages, watchedBarangays: _watchedBarangays));
      }
    } catch (e) {
      emit(OutagesError(e.toString()));
    }
  }
}
