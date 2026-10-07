enum UserRole { nurse, patient, doctor, admin }

UserRole roleFromString(String value) {
  switch (value.toLowerCase()) {
    case 'nurse':
      return UserRole.nurse;
    case 'patient':
      return UserRole.patient;
    case 'doctor':
      return UserRole.doctor;
    case 'admin':
      return UserRole.admin;
    default:
      throw ArgumentError('Unknown role: $value');
  }
}

class AppUser {
  final String id;
  final String name;
  final UserRole role;
  final String? surgeryType;
  final String? surgeryDate;

  const AppUser({
    required this.id,
    required this.name,
    required this.role,
    this.surgeryType,
    this.surgeryDate,
  });

  /// The API returns `fullName`; `name` is accepted as a fallback. Reading only
  /// `name` left this empty, so the nurse dashboard greeted people with "Hello ".
  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        name: (json['fullName'] ?? json['name']) as String? ?? '',
        role: roleFromString(json['role'] as String),
        surgeryType: json['surgeryType'] as String?,
        surgeryDate: json['surgeryDate'] as String?,
      );
}

class AuthSession {
  final String accessToken;
  final AppUser user;

  const AuthSession({required this.accessToken, required this.user});

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        accessToken: json['accessToken'] as String,
        user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
      );
}
