// An offline gazetteer for the admin page "User's data": approximate coordinates of every country, ~430 big cities (about 190 of them Indian) and the regions the connection's place
// usually names. Nothing is looked up on the internet. A place that is not in here is shown as "unplaced", never guessed. To add one, see docs/ADMIN-USER-DATA.md.
// Centroids and city centres are rounded to two decimals (about 1 km); the page adds a deliberate scatter on top, so no dot is a street address.
//
// Formats (one entry per line, plain ASCII; "/" separates alternative spellings of the same name):
//   COUNTRIES:  <ISO-3166 alpha-2> <lat> <lng> <English name>
//   CITIES / REGIONS:  a line "@XX" starts a country, then "<name> <lat> <lng>" lines.

export const COUNTRY_DATA = `
AD 42.55 1.60 Andorra
AE 23.42 53.85 United Arab Emirates
AF 33.94 67.71 Afghanistan
AG 17.06 -61.80 Antigua and Barbuda
AI 18.22 -63.07 Anguilla
AL 41.15 20.17 Albania
AM 40.07 45.04 Armenia
AO -11.20 17.87 Angola
AR -38.42 -63.62 Argentina
AS -14.27 -170.13 American Samoa
AT 47.52 14.55 Austria
AU -25.27 133.78 Australia
AW 12.52 -69.97 Aruba
AX 60.18 19.92 Aland Islands
AZ 40.14 47.58 Azerbaijan
BA 43.92 17.68 Bosnia and Herzegovina
BB 13.19 -59.54 Barbados
BD 23.68 90.36 Bangladesh
BE 50.50 4.47 Belgium
BF 12.24 -1.56 Burkina Faso
BG 42.73 25.49 Bulgaria
BH 26.07 50.56 Bahrain
BI -3.37 29.92 Burundi
BJ 9.31 2.32 Benin
BL 17.90 -62.83 Saint Barthelemy
BM 32.31 -64.75 Bermuda
BN 4.54 114.73 Brunei
BO -16.29 -63.59 Bolivia
BQ 12.18 -68.24 Caribbean Netherlands
BR -14.24 -51.93 Brazil
BS 25.03 -77.40 Bahamas
BT 27.51 90.43 Bhutan
BW -22.33 24.68 Botswana
BY 53.71 27.95 Belarus
BZ 17.19 -88.50 Belize
CA 56.13 -106.35 Canada
CC -12.16 96.87 Cocos Islands
CD -4.04 21.76 DR Congo
CF 6.61 20.94 Central African Republic
CG -0.23 15.83 Republic of the Congo
CH 46.82 8.23 Switzerland
CI 7.54 -5.55 Ivory Coast
CK -21.24 -159.78 Cook Islands
CL -35.68 -71.54 Chile
CM 7.37 12.35 Cameroon
CN 35.86 104.20 China
CO 4.57 -74.30 Colombia
CR 9.75 -83.75 Costa Rica
CU 21.52 -77.78 Cuba
CV 16.00 -24.01 Cape Verde
CW 12.17 -68.99 Curacao
CX -10.45 105.69 Christmas Island
CY 35.13 33.43 Cyprus
CZ 49.82 15.47 Czechia
DE 51.17 10.45 Germany
DJ 11.83 42.59 Djibouti
DK 56.26 9.50 Denmark
DM 15.41 -61.37 Dominica
DO 18.74 -70.16 Dominican Republic
DZ 28.03 1.66 Algeria
EC -1.83 -78.18 Ecuador
EE 58.60 25.01 Estonia
EG 26.82 30.80 Egypt
EH 24.22 -12.89 Western Sahara
ER 15.18 39.78 Eritrea
ES 40.46 -3.75 Spain
ET 9.15 40.49 Ethiopia
FI 61.92 25.75 Finland
FJ -16.58 179.41 Fiji
FK -51.80 -59.52 Falkland Islands
FM 7.43 150.55 Micronesia
FO 61.89 -6.91 Faroe Islands
FR 46.23 2.21 France
GA -0.80 11.61 Gabon
GB 55.38 -3.44 United Kingdom
GD 12.12 -61.68 Grenada
GE 42.32 43.36 Georgia
GF 3.93 -53.13 French Guiana
GG 49.47 -2.59 Guernsey
GH 7.95 -1.02 Ghana
GI 36.14 -5.35 Gibraltar
GL 71.71 -42.60 Greenland
GM 13.44 -15.31 Gambia
GN 9.95 -9.70 Guinea
GP 16.27 -61.55 Guadeloupe
GQ 1.65 10.27 Equatorial Guinea
GR 39.07 21.82 Greece
GT 15.78 -90.23 Guatemala
GU 13.44 144.79 Guam
GW 11.80 -15.18 Guinea-Bissau
GY 4.86 -58.93 Guyana
HK 22.32 114.17 Hong Kong
HN 15.20 -86.24 Honduras
HR 45.10 15.20 Croatia
HT 18.97 -72.29 Haiti
HU 47.16 19.50 Hungary
ID -0.79 113.92 Indonesia
IE 53.41 -8.24 Ireland
IL 31.05 34.85 Israel
IM 54.24 -4.55 Isle of Man
IN 20.59 78.96 India
IO -6.34 71.88 British Indian Ocean Territory
IQ 33.22 43.68 Iraq
IR 32.43 53.69 Iran
IS 64.96 -19.02 Iceland
IT 41.87 12.57 Italy
JE 49.21 -2.13 Jersey
JM 18.11 -77.30 Jamaica
JO 30.59 36.24 Jordan
JP 36.20 138.25 Japan
KE -0.02 37.91 Kenya
KG 41.20 74.77 Kyrgyzstan
KH 12.57 104.99 Cambodia
KI -3.37 -168.73 Kiribati
KM -11.88 43.87 Comoros
KN 17.36 -62.78 Saint Kitts and Nevis
KP 40.34 127.51 North Korea
KR 35.91 127.77 South Korea
KW 29.31 47.48 Kuwait
KY 19.51 -80.57 Cayman Islands
KZ 48.02 66.92 Kazakhstan
LA 19.86 102.50 Laos
LB 33.85 35.86 Lebanon
LC 13.91 -60.98 Saint Lucia
LI 47.17 9.56 Liechtenstein
LK 7.87 80.77 Sri Lanka
LR 6.43 -9.43 Liberia
LS -29.61 28.23 Lesotho
LT 55.17 23.88 Lithuania
LU 49.82 6.13 Luxembourg
LV 56.88 24.60 Latvia
LY 26.34 17.23 Libya
MA 31.79 -7.09 Morocco
MC 43.74 7.41 Monaco
MD 47.41 28.37 Moldova
ME 42.71 19.37 Montenegro
MF 18.08 -63.05 Saint Martin
MG -18.77 46.87 Madagascar
MH 7.13 171.18 Marshall Islands
MK 41.61 21.75 North Macedonia
ML 17.57 -3.99 Mali
MM 21.91 95.96 Myanmar
MN 46.86 103.85 Mongolia
MO 22.20 113.54 Macao
MP 15.10 145.67 Northern Mariana Islands
MQ 14.64 -61.02 Martinique
MR 21.01 -10.94 Mauritania
MS 16.74 -62.19 Montserrat
MT 35.94 14.38 Malta
MU -20.35 57.55 Mauritius
MV 3.20 73.22 Maldives
MW -13.25 34.30 Malawi
MX 23.63 -102.55 Mexico
MY 4.21 101.98 Malaysia
MZ -18.67 35.53 Mozambique
NA -22.96 18.49 Namibia
NC -20.90 165.62 New Caledonia
NE 17.61 8.08 Niger
NF -29.04 167.95 Norfolk Island
NG 9.08 8.68 Nigeria
NI 12.87 -85.21 Nicaragua
NL 52.13 5.29 Netherlands
NO 60.47 8.47 Norway
NP 28.39 84.12 Nepal
NR -0.52 166.93 Nauru
NU -19.05 -169.87 Niue
NZ -40.90 174.89 New Zealand
OM 21.51 55.92 Oman
PA 8.54 -80.78 Panama
PE -9.19 -75.02 Peru
PF -17.68 -149.41 French Polynesia
PG -6.31 143.96 Papua New Guinea
PH 12.88 121.77 Philippines
PK 30.38 69.35 Pakistan
PL 51.92 19.15 Poland
PM 46.94 -56.27 Saint Pierre and Miquelon
PN -24.70 -127.44 Pitcairn Islands
PR 18.22 -66.59 Puerto Rico
PS 31.95 35.23 Palestine
PT 39.40 -8.22 Portugal
PW 7.51 134.58 Palau
PY -23.44 -58.44 Paraguay
QA 25.35 51.18 Qatar
RE -21.12 55.54 Reunion
RO 45.94 24.97 Romania
RS 44.02 21.01 Serbia
RU 61.52 105.32 Russia
RW -1.94 29.87 Rwanda
SA 23.89 45.08 Saudi Arabia
SB -9.65 160.16 Solomon Islands
SC -4.68 55.49 Seychelles
SD 12.86 30.22 Sudan
SE 60.13 18.64 Sweden
SG 1.35 103.82 Singapore
SH -24.14 -10.03 Saint Helena
SI 46.15 14.99 Slovenia
SJ 77.55 23.67 Svalbard
SK 48.67 19.70 Slovakia
SL 8.46 -11.78 Sierra Leone
SM 43.94 12.46 San Marino
SN 14.50 -14.45 Senegal
SO 5.15 46.20 Somalia
SR 3.92 -56.03 Suriname
SS 6.88 31.31 South Sudan
ST 0.19 6.61 Sao Tome and Principe
SV 13.79 -88.90 El Salvador
SX 18.04 -63.07 Sint Maarten
SY 34.80 39.00 Syria
SZ -26.52 31.47 Eswatini
TC 21.69 -71.80 Turks and Caicos Islands
TD 15.45 18.73 Chad
TG 8.62 0.82 Togo
TH 15.87 100.99 Thailand
TJ 38.86 71.28 Tajikistan
TK -8.97 -171.86 Tokelau
TL -8.87 125.73 Timor-Leste
TM 38.97 59.56 Turkmenistan
TN 33.89 9.54 Tunisia
TO -21.18 -175.20 Tonga
TR 38.96 35.24 Turkey
TT 10.69 -61.22 Trinidad and Tobago
TV -7.11 177.65 Tuvalu
TW 23.70 120.96 Taiwan
TZ -6.37 34.89 Tanzania
UA 48.38 31.17 Ukraine
UG 1.37 32.29 Uganda
US 39.83 -98.58 United States
UY -32.52 -55.77 Uruguay
UZ 41.38 64.59 Uzbekistan
VA 41.90 12.45 Vatican City
VC 12.98 -61.29 Saint Vincent and the Grenadines
VE 6.42 -66.59 Venezuela
VG 18.42 -64.64 British Virgin Islands
VI 18.34 -64.90 US Virgin Islands
VN 14.06 108.28 Vietnam
VU -15.38 166.96 Vanuatu
WF -13.77 -177.16 Wallis and Futuna
WS -13.76 -172.10 Samoa
XK 42.60 20.90 Kosovo
YE 15.55 48.52 Yemen
YT -12.83 45.17 Mayotte
ZA -30.56 22.94 South Africa
ZM -13.13 27.85 Zambia
ZW -19.02 29.15 Zimbabwe
`;

export const CITY_DATA = `
@IN
Mumbai/Bombay 19.08 72.88
Delhi/New Delhi 28.61 77.21
Bengaluru/Bangalore 12.97 77.59
Hyderabad 17.39 78.49
Ahmedabad 23.02 72.57
Chennai/Madras 13.08 80.27
Kolkata/Calcutta 22.57 88.36
Pune 18.52 73.86
Surat 21.17 72.83
Jaipur 26.91 75.79
Lucknow 26.85 80.95
Kanpur 26.45 80.33
Nagpur 21.15 79.09
Indore 22.72 75.86
Thane 19.22 72.98
Bhopal 23.26 77.41
Visakhapatnam/Vizag 17.69 83.22
Pimpri-Chinchwad/Pimpri Chinchwad 18.63 73.80
Patna 25.59 85.14
Vadodara/Baroda 22.31 73.18
Ghaziabad 28.67 77.45
Ludhiana 30.90 75.86
Agra 27.18 78.01
Nashik/Nasik 20.00 73.79
Faridabad 28.41 77.31
Meerut 28.98 77.71
Rajkot 22.30 70.80
Kalyan/Kalyan-Dombivli 19.24 73.13
Vasai-Virar/Vasai 19.39 72.84
Varanasi/Benares 25.32 82.97
Srinagar 34.08 74.80
Aurangabad/Chhatrapati Sambhajinagar 19.88 75.34
Dhanbad 23.80 86.43
Amritsar 31.63 74.87
Navi Mumbai 19.03 73.03
Prayagraj/Allahabad 25.44 81.85
Howrah 22.59 88.31
Ranchi 23.34 85.31
Gwalior 26.22 78.18
Jabalpur 23.18 79.99
Coimbatore 11.02 76.96
Vijayawada 16.51 80.65
Jodhpur 26.24 73.02
Madurai 9.93 78.12
Raipur 21.25 81.63
Kota 25.18 75.83
Guwahati 26.14 91.74
Chandigarh 30.73 76.78
Solapur 17.66 75.91
Hubballi/Hubli 15.36 75.12
Dharwad 15.46 75.01
Mysuru/Mysore 12.30 76.64
Tiruchirappalli/Trichy 10.79 78.70
Bareilly 28.35 79.42
Aligarh 27.88 78.08
Tiruppur 11.11 77.34
Moradabad 28.84 78.78
Jalandhar 31.33 75.58
Bhubaneswar 20.30 85.82
Salem 11.66 78.15
Warangal 17.97 79.60
Guntur 16.31 80.44
Bhiwandi 19.30 73.06
Saharanpur 29.97 77.55
Gorakhpur 26.76 83.37
Bikaner 28.02 73.31
Amravati 20.93 77.75
Noida 28.54 77.39
Greater Noida 28.47 77.50
Jamshedpur 22.80 86.20
Bhilai 21.21 81.38
Cuttack 20.46 85.88
Firozabad 27.15 78.40
Kochi/Cochin 9.93 76.27
Bhavnagar 21.76 72.15
Dehradun 30.32 78.03
Durgapur 23.55 87.32
Asansol 23.68 86.98
Nanded 19.14 77.32
Kolhapur 16.70 74.24
Ajmer 26.45 74.64
Akola 20.71 77.00
Gulbarga/Kalaburagi 17.33 76.83
Jamnagar 22.47 70.07
Ujjain 23.18 75.78
Loni 28.75 77.29
Siliguri 26.73 88.40
Jhansi 25.45 78.57
Ulhasnagar 19.22 73.16
Jammu 32.73 74.87
Sangli 16.85 74.57
Mangaluru/Mangalore 12.91 74.86
Erode 11.34 77.72
Belgaum/Belagavi 15.85 74.50
Ambattur 13.11 80.15
Tirunelveli 8.73 77.70
Malegaon 20.55 74.53
Gaya 24.80 85.00
Jalgaon 21.01 75.57
Udaipur 24.59 73.71
Maheshtala 22.50 88.25
Thiruvananthapuram/Trivandrum 8.52 76.94
Kozhikode/Calicut 11.26 75.78
Thrissur/Trichur 10.53 76.21
Kollam/Quilon 8.89 76.61
Kannur/Cannanore 11.87 75.37
Alappuzha/Alleppey 9.50 76.34
Palakkad/Palghat 10.78 76.65
Ernakulam 9.98 76.28
Kottayam 9.59 76.52
Puducherry/Pondicherry 11.93 79.83
Thanjavur/Tanjore 10.79 79.14
Vellore 12.92 79.13
Tiruvannamalai 12.23 79.07
Nellore 14.44 79.99
Kurnool 15.83 78.04
Rajahmundry/Rajamahendravaram 17.00 81.78
Kakinada 16.99 82.25
Tirupati 13.63 79.42
Anantapur 14.68 77.60
Karimnagar 18.44 79.13
Nizamabad 18.67 78.09
Khammam 17.25 80.15
Secunderabad 17.44 78.50
Bellary/Ballari 15.14 76.92
Davangere 14.47 75.92
Shimoga/Shivamogga 13.93 75.57
Tumkur/Tumakuru 13.34 77.10
Udupi 13.34 74.75
Bijapur/Vijayapura 16.83 75.71
Panaji/Panjim 15.50 73.83
Margao 15.27 73.96
Vasco da Gama 15.40 73.81
Gandhinagar 23.22 72.65
Anand 22.56 72.93
Morbi 22.82 70.84
Junagadh 21.52 70.46
Bharuch 21.71 72.99
Navsari 20.95 72.95
Vapi 20.37 72.90
Mehsana 23.59 72.37
Pali 25.77 73.32
Alwar 27.55 76.63
Bharatpur 27.22 77.49
Sikar 27.61 75.14
Bhilwara 25.35 74.64
Sri Ganganagar 29.92 73.88
Mathura 27.49 77.67
Muzaffarnagar 29.47 77.70
Rampur 28.80 79.03
Shahjahanpur 27.88 79.91
Ayodhya 26.80 82.20
Sultanpur 26.26 82.07
Mirzapur 25.15 82.57
Azamgarh 26.07 83.19
Haridwar 29.95 78.16
Rishikesh 30.09 78.27
Haldwani 29.22 79.51
Roorkee 29.85 77.89
Shimla 31.10 77.17
Manali 32.24 77.19
Dharamshala 32.22 76.32
Solan 30.91 77.10
Ambala 30.38 76.78
Panipat 29.39 76.97
Karnal 29.69 76.99
Rohtak 28.89 76.61
Hisar 29.15 75.72
Gurugram/Gurgaon 28.46 77.03
Sonipat 28.99 77.02
Panchkula 30.69 76.86
Patiala 30.34 76.39
Bathinda 30.21 74.95
Mohali/SAS Nagar 30.70 76.72
Pathankot 32.27 75.65
Anantnag 33.73 75.15
Leh 34.17 77.58
Muzaffarpur 26.12 85.39
Bhagalpur 25.24 86.97
Darbhanga 26.15 85.90
Purnia 25.78 87.47
Bokaro 23.67 86.15
Deoghar 24.48 86.70
Hazaribagh 23.99 85.36
Sambalpur 21.47 83.97
Rourkela 22.26 84.85
Berhampur 19.31 84.79
Puri 19.81 85.83
Bilaspur 22.08 82.14
Korba 22.35 82.68
Durg 21.19 81.28
Satna 24.60 80.83
Rewa 24.53 81.30
Sagar 23.84 78.74
Dewas 22.97 76.05
Ratlam 23.33 75.04
Burhanpur 21.31 76.23
Shillong 25.58 91.89
Imphal 24.82 93.94
Aizawl 23.73 92.72
Kohima 25.67 94.11
Itanagar 27.08 93.62
Agartala 23.83 91.28
Gangtok 27.33 88.61
Dibrugarh 27.47 94.91
Silchar 24.83 92.78
Jorhat 26.76 94.20
Tezpur 26.63 92.80
Nagaon 26.35 92.68
Port Blair 11.62 92.73
Kavaratti 10.57 72.64
Daman 20.40 72.83
Silvassa 20.27 73.01
Kharagpur 22.35 87.32
Haldia 22.07 88.07
Bardhaman/Burdwan 23.23 87.86
Darjeeling 27.04 88.26
Jalpaiguri 26.52 88.73
Ichalkaranji 16.69 74.46
Latur 18.40 76.58
Ahmednagar/Ahilyanagar 19.09 74.74
Satara 17.69 74.00
Chandrapur 19.96 79.30
Parbhani 19.27 76.77
Dhule 20.90 74.77
Beed 18.99 75.76
Ratnagiri 16.99 73.30
Thoothukudi/Tuticorin 8.76 78.13
Dindigul 10.37 77.98
Nagercoil 8.18 77.43
Hosur 12.74 77.83
Karur 10.96 78.08
Kanchipuram 12.83 79.70
Cuddalore 11.75 79.77
Namakkal 11.22 78.17
Sivakasi 9.45 77.80
Ooty/Udhagamandalam 11.41 76.70
@PK
Karachi 24.86 67.01
Lahore 31.55 74.34
Islamabad 33.68 73.05
Rawalpindi 33.60 73.04
Faisalabad 31.42 73.08
Multan 30.20 71.47
Peshawar 34.01 71.58
Quetta 30.18 66.98
Hyderabad 25.40 68.37
Gujranwala 32.16 74.19
Sialkot 32.49 74.53
@BD
Dhaka/Dacca 23.81 90.41
Chittagong/Chattogram 22.36 91.78
Khulna 22.85 89.54
Sylhet 24.90 91.87
Rajshahi 24.37 88.60
@NP
Kathmandu 27.72 85.32
Pokhara 28.21 83.99
@LK
Colombo 6.93 79.86
Kandy 7.29 80.63
@BT
Thimphu 27.47 89.64
@MV
Male 4.18 73.51
@AF
Kabul 34.53 69.17
Kandahar 31.63 65.71
Herat 34.35 62.20
@US
New York/New York City 40.71 -74.01
Los Angeles 34.05 -118.24
Chicago 41.88 -87.63
Houston 29.76 -95.37
Phoenix 33.45 -112.07
Philadelphia 39.95 -75.17
San Antonio 29.42 -98.49
San Diego 32.72 -117.16
Dallas 32.78 -96.80
San Jose 37.34 -121.89
Austin 30.27 -97.74
Jacksonville 30.33 -81.66
San Francisco 37.77 -122.42
Seattle 47.61 -122.33
Denver 39.74 -104.99
Washington/Washington D.C./Washington DC 38.91 -77.04
Boston 42.36 -71.06
Las Vegas 36.17 -115.14
Detroit 42.33 -83.05
Portland 45.52 -122.68
Atlanta 33.75 -84.39
Miami 25.76 -80.19
Minneapolis 44.98 -93.27
Charlotte 35.23 -80.84
Columbus 39.96 -83.00
Nashville 36.16 -86.78
Orlando 28.54 -81.38
Tampa 27.95 -82.46
St. Louis/Saint Louis 38.63 -90.20
Pittsburgh 40.44 -80.00
Salt Lake City 40.76 -111.89
Kansas City 39.10 -94.58
Sacramento 38.58 -121.49
New Orleans 29.95 -90.07
Honolulu 21.31 -157.86
Anchorage 61.22 -149.90
Ashburn 39.04 -77.49
Newark 40.74 -74.17
Fremont 37.55 -121.99
Santa Clara 37.35 -121.96
Irvine 33.68 -117.83
Raleigh 35.78 -78.64
Cleveland 41.50 -81.69
Cincinnati 39.10 -84.51
Indianapolis 39.77 -86.16
Milwaukee 43.04 -87.91
Baltimore 39.29 -76.61
Richmond 37.54 -77.44
Oklahoma City 35.47 -97.52
Albuquerque 35.08 -106.65
Tucson 32.22 -110.97
El Paso 31.76 -106.49
Memphis 35.15 -90.05
Louisville 38.25 -85.76
Buffalo 42.89 -78.88
Boise 43.62 -116.20
Plano 33.02 -96.70
Edison 40.52 -74.41
@CA
Toronto 43.65 -79.38
Montreal 45.50 -73.57
Vancouver 49.28 -123.12
Calgary 51.05 -114.07
Edmonton 53.55 -113.49
Ottawa 45.42 -75.70
Winnipeg 49.90 -97.14
Quebec City/Quebec 46.81 -71.21
Halifax 44.65 -63.57
Mississauga 43.59 -79.64
Brampton 43.73 -79.76
Surrey 49.19 -122.85
Hamilton 43.26 -79.87
Saskatoon 52.13 -106.67
Regina 50.45 -104.62
@MX
Mexico City/Ciudad de Mexico 19.43 -99.13
Guadalajara 20.66 -103.35
Monterrey 25.69 -100.32
Puebla 19.04 -98.21
Tijuana 32.51 -117.04
Cancun 21.16 -86.85
@BR
Sao Paulo -23.55 -46.63
Rio de Janeiro -22.91 -43.17
Brasilia -15.79 -47.88
Salvador -12.97 -38.51
Fortaleza -3.73 -38.52
Belo Horizonte -19.92 -43.94
Manaus -3.12 -60.02
Curitiba -25.43 -49.27
Recife -8.05 -34.88
Porto Alegre -30.03 -51.23
@AR
Buenos Aires -34.60 -58.38
Cordoba -31.42 -64.18
Rosario -32.95 -60.64
@CL
Santiago -33.45 -70.67
@PE
Lima -12.05 -77.04
@CO
Bogota 4.71 -74.07
Medellin 6.24 -75.58
Cali 3.45 -76.53
@VE
Caracas 10.48 -66.90
@EC
Quito -0.18 -78.47
Guayaquil -2.17 -79.92
@BO
La Paz -16.50 -68.15
Santa Cruz de la Sierra/Santa Cruz -17.78 -63.18
@UY
Montevideo -34.90 -56.16
@PY
Asuncion -25.26 -57.58
@PA
Panama City/Panama 8.98 -79.52
@CR
San Jose 9.93 -84.08
@GT
Guatemala City 14.63 -90.51
@SV
San Salvador 13.69 -89.22
@HN
Tegucigalpa 14.07 -87.19
@CU
Havana 23.11 -82.37
@DO
Santo Domingo 18.49 -69.93
@PR
San Juan 18.47 -66.11
@JM
Kingston 17.97 -76.79
@TT
Port of Spain 10.66 -61.51
@GB
London 51.51 -0.13
Manchester 53.48 -2.24
Birmingham 52.49 -1.89
Glasgow 55.86 -4.25
Edinburgh 55.95 -3.19
Liverpool 53.41 -2.99
Leeds 53.80 -1.55
Bristol 51.45 -2.59
Leicester 52.64 -1.13
Cardiff 51.48 -3.18
Belfast 54.60 -5.93
Sheffield 53.38 -1.47
Nottingham 52.95 -1.15
Slough 51.51 -0.59
@IE
Dublin 53.35 -6.26
Cork 51.90 -8.47
@FR
Paris 48.86 2.35
Marseille 43.30 5.37
Lyon 45.76 4.84
Toulouse 43.60 1.44
Nice 43.70 7.27
Nantes 47.22 -1.55
Strasbourg 48.57 7.75
Bordeaux 44.84 -0.58
Lille 50.63 3.06
@DE
Berlin 52.52 13.40
Hamburg 53.55 9.99
Munich/Muenchen/Munchen 48.14 11.58
Cologne/Koeln/Koln 50.94 6.96
Frankfurt/Frankfurt am Main 50.11 8.68
Stuttgart 48.78 9.18
Dusseldorf 51.23 6.78
Leipzig 51.34 12.37
Dresden 51.05 13.74
Hanover/Hannover 52.37 9.74
Nuremberg/Nuernberg/Nurnberg 49.45 11.08
@ES
Madrid 40.42 -3.70
Barcelona 41.39 2.17
Valencia 39.47 -0.38
Seville/Sevilla 37.39 -5.98
Zaragoza 41.65 -0.88
Malaga 36.72 -4.42
Bilbao 43.26 -2.93
@PT
Lisbon/Lisboa 38.72 -9.14
Porto 41.15 -8.61
@IT
Rome/Roma 41.90 12.50
Milan/Milano 45.46 9.19
Naples/Napoli 40.85 14.27
Turin/Torino 45.07 7.69
Florence/Firenze 43.77 11.26
Bologna 44.49 11.34
Venice/Venezia 45.44 12.32
Palermo 38.12 13.36
Genoa/Genova 44.41 8.93
@NL
Amsterdam 52.37 4.90
Rotterdam 51.92 4.48
The Hague/Den Haag 52.08 4.31
Utrecht 52.09 5.12
Eindhoven 51.44 5.48
@BE
Brussels/Bruxelles 50.85 4.35
Antwerp/Antwerpen 51.22 4.40
Ghent/Gent 51.05 3.72
@LU
Luxembourg 49.61 6.13
@CH
Zurich 47.38 8.54
Geneva/Geneve 46.20 6.14
Bern 46.95 7.45
Basel 47.56 7.59
@AT
Vienna/Wien 48.21 16.37
Graz 47.07 15.44
@CZ
Prague/Praha 50.08 14.44
Brno 49.20 16.61
@PL
Warsaw/Warszawa 52.23 21.01
Krakow 50.06 19.94
Lodz 51.76 19.46
Wroclaw 51.11 17.04
Gdansk 54.35 18.65
Poznan 52.41 16.93
@HU
Budapest 47.50 19.04
@SK
Bratislava 48.15 17.11
@SI
Ljubljana 46.06 14.51
@HR
Zagreb 45.81 15.98
@RS
Belgrade/Beograd 44.79 20.45
@BA
Sarajevo 43.86 18.41
@MK
Skopje 42.00 21.43
@BG
Sofia 42.70 23.32
@RO
Bucharest/Bucuresti 44.43 26.10
Cluj-Napoca/Cluj 46.77 23.59
@MD
Chisinau 47.01 28.86
@GR
Athens 37.98 23.73
Thessaloniki 40.64 22.94
@AL
Tirana 41.33 19.82
@ME
Podgorica 42.44 19.26
@XK
Pristina 42.66 21.17
@DK
Copenhagen/Kobenhavn 55.68 12.57
Aarhus 56.16 10.20
@SE
Stockholm 59.33 18.07
Gothenburg/Goteborg 57.71 11.97
Malmo 55.60 13.00
@NO
Oslo 59.91 10.75
Bergen 60.39 5.32
@FI
Helsinki 60.17 24.94
Tampere 61.50 23.76
@IS
Reykjavik 64.15 -21.94
@EE
Tallinn 59.44 24.75
@LV
Riga 56.95 24.11
@LT
Vilnius 54.69 25.28
@UA
Kyiv/Kiev 50.45 30.52
Kharkiv 49.99 36.23
Odesa/Odessa 46.48 30.73
Lviv 49.84 24.03
@BY
Minsk 53.90 27.57
@RU
Moscow/Moskva 55.76 37.62
Saint Petersburg/St Petersburg/St. Petersburg 59.93 30.36
Novosibirsk 55.01 82.93
Yekaterinburg 56.84 60.61
Kazan 55.80 49.11
Nizhny Novgorod 56.33 44.00
Samara 53.20 50.15
Rostov-on-Don 47.24 39.71
Krasnoyarsk 56.01 92.85
Vladivostok 43.12 131.89
@MT
Valletta 35.90 14.51
@CY
Nicosia 35.19 33.38
@MC
Monaco 43.74 7.42
@TR
Istanbul 41.01 28.98
Ankara 39.93 32.86
Izmir 38.42 27.14
Bursa 40.19 29.06
Antalya 36.90 30.70
@AE
Dubai 25.20 55.27
Abu Dhabi 24.45 54.38
Sharjah 25.35 55.40
Ajman 25.41 55.44
Ras Al Khaimah 25.79 55.94
Al Ain 24.21 55.76
@QA
Doha 25.29 51.53
@BH
Manama 26.23 50.59
@KW
Kuwait City/Kuwait 29.38 47.99
@OM
Muscat 23.59 58.41
@SA
Riyadh 24.71 46.68
Jeddah 21.54 39.17
Mecca/Makkah 21.39 39.86
Medina/Madinah 24.52 39.57
Dammam 26.43 50.10
@IR
Tehran 35.69 51.39
Mashhad 36.30 59.60
Isfahan 32.65 51.67
Shiraz 29.59 52.58
Tabriz 38.08 46.29
@IQ
Baghdad 33.31 44.37
Basra 30.51 47.78
Erbil 36.19 44.01
@JO
Amman 31.95 35.93
@LB
Beirut 33.89 35.50
@SY
Damascus 33.51 36.28
Aleppo 36.20 37.16
@IL
Jerusalem 31.77 35.22
Tel Aviv 32.09 34.78
Haifa 32.79 34.99
@YE
Sanaa 15.37 44.19
@AZ
Baku 40.41 49.87
@GE
Tbilisi 41.72 44.79
@AM
Yerevan 40.18 44.51
@UZ
Tashkent 41.30 69.24
Samarkand 39.65 66.96
@KZ
Almaty 43.24 76.89
Astana/Nur-Sultan 51.17 71.43
@KG
Bishkek 42.87 74.59
@TJ
Dushanbe 38.56 68.79
@TM
Ashgabat 37.96 58.33
@MN
Ulaanbaatar 47.89 106.91
@CN
Beijing 39.90 116.41
Shanghai 31.23 121.47
Guangzhou 23.13 113.26
Shenzhen 22.54 114.06
Chengdu 30.57 104.07
Chongqing 29.56 106.55
Tianjin 39.34 117.36
Wuhan 30.59 114.31
Hangzhou 30.27 120.16
Nanjing 32.06 118.80
Xian 34.34 108.94
Shenyang 41.81 123.43
Harbin 45.80 126.53
Suzhou 31.30 120.59
Qingdao 36.07 120.38
Zhengzhou 34.75 113.62
Changsha 28.23 112.94
Kunming 25.04 102.71
Xiamen 24.48 118.09
Dalian 38.91 121.61
Urumqi 43.83 87.62
@HK
Hong Kong 22.32 114.17
@MO
Macau/Macao 22.20 113.54
@TW
Taipei 25.03 121.57
Kaohsiung 22.63 120.30
Taichung 24.15 120.67
@JP
Tokyo 35.68 139.69
Yokohama 35.44 139.64
Osaka 34.69 135.50
Nagoya 35.18 136.91
Sapporo 43.06 141.35
Fukuoka 33.59 130.40
Kobe 34.69 135.20
Kyoto 35.01 135.77
Kawasaki 35.53 139.70
Saitama 35.86 139.65
Hiroshima 34.39 132.46
Sendai 38.27 140.87
Naha 26.21 127.68
@KR
Seoul 37.57 126.98
Busan 35.18 129.08
Incheon 37.46 126.71
Daegu 35.87 128.60
Daejeon 36.35 127.38
Gwangju 35.16 126.85
@KP
Pyongyang 39.04 125.76
@TH
Bangkok 13.76 100.50
Chiang Mai 18.79 98.98
Phuket 7.88 98.39
Pattaya 12.93 100.88
@VN
Hanoi 21.03 105.85
Ho Chi Minh City/Saigon 10.82 106.63
Da Nang 16.05 108.21
Haiphong 20.84 106.69
@KH
Phnom Penh 11.56 104.93
Siem Reap 13.37 103.86
@LA
Vientiane 17.97 102.63
@MM
Yangon/Rangoon 16.87 96.20
Mandalay 21.98 96.08
Naypyidaw 19.76 96.08
@MY
Kuala Lumpur 3.14 101.69
George Town/Penang 5.41 100.33
Johor Bahru 1.49 103.74
Kota Kinabalu 5.98 116.07
Kuching 1.55 110.35
@SG
Singapore 1.35 103.82
@ID
Jakarta -6.21 106.85
Surabaya -7.26 112.75
Bandung -6.92 107.61
Medan 3.59 98.67
Semarang -6.97 110.42
Makassar -5.15 119.43
Denpasar/Bali -8.65 115.22
Palembang -2.98 104.76
Yogyakarta -7.80 110.36
@PH
Manila 14.60 120.98
Quezon City 14.68 121.04
Cebu/Cebu City 10.32 123.89
Davao/Davao City 7.07 125.61
@BN
Bandar Seri Begawan 4.89 114.94
@TL
Dili -8.56 125.57
@EG
Cairo 30.04 31.24
Alexandria 31.20 29.92
Giza 30.01 31.21
@NG
Lagos 6.52 3.38
Abuja 9.08 7.40
Kano 12.00 8.52
Ibadan 7.38 3.95
Port Harcourt 4.82 7.05
@GH
Accra 5.60 -0.19
Kumasi 6.69 -1.62
@CI
Abidjan 5.36 -4.01
@SN
Dakar 14.72 -17.47
@ML
Bamako 12.64 -8.00
@BF
Ouagadougou 12.37 -1.52
@NE
Niamey 13.51 2.11
@GN
Conakry 9.64 -13.58
@SL
Freetown 8.48 -13.23
@LR
Monrovia 6.30 -10.80
@TG
Lome 6.17 1.23
@BJ
Cotonou 6.37 2.39
@MA
Casablanca 33.57 -7.59
Rabat 34.02 -6.84
Marrakesh/Marrakech 31.63 -8.01
@TN
Tunis 36.81 10.18
@DZ
Algiers/Alger 36.75 3.06
@LY
Tripoli 32.89 13.19
@SD
Khartoum 15.50 32.56
@ET
Addis Ababa 9.03 38.74
@KE
Nairobi -1.29 36.82
Mombasa -4.04 39.67
@UG
Kampala 0.35 32.58
@TZ
Dar es Salaam -6.79 39.21
Dodoma -6.16 35.75
@RW
Kigali -1.95 30.06
@BI
Bujumbura -3.38 29.36
@SO
Mogadishu 2.05 45.32
@DJ
Djibouti 11.59 43.15
@CD
Kinshasa -4.44 15.27
@AO
Luanda -8.84 13.23
@CG
Brazzaville -4.27 15.28
@CM
Douala 4.05 9.77
Yaounde 3.85 11.50
@GA
Libreville 0.42 9.47
@ZM
Lusaka -15.39 28.32
@ZW
Harare -17.83 31.05
Bulawayo -20.15 28.58
@MZ
Maputo -25.97 32.57
@MW
Lilongwe -13.97 33.79
Blantyre -15.79 35.01
@MG
Antananarivo -18.88 47.51
@MU
Port Louis -20.16 57.50
@NA
Windhoek -22.56 17.08
@BW
Gaborone -24.65 25.91
@ZA
Johannesburg -26.20 28.05
Cape Town -33.92 18.42
Durban -29.86 31.02
Pretoria/Tshwane -25.75 28.19
Port Elizabeth/Gqeberha -33.96 25.60
@LS
Maseru -29.31 27.48
@SZ
Mbabane -26.31 31.14
@TD
Ndjamena/N Djamena 12.13 15.06
@CF
Bangui 4.36 18.56
@ER
Asmara 15.34 38.93
@SS
Juba 4.85 31.58
@AU
Sydney -33.87 151.21
Melbourne -37.81 144.96
Brisbane -27.47 153.03
Perth -31.95 115.86
Adelaide -34.93 138.60
Canberra -35.28 149.13
Gold Coast -28.02 153.40
Hobart -42.88 147.33
Darwin -12.46 130.84
Newcastle -32.93 151.78
@NZ
Auckland -36.85 174.76
Wellington -41.29 174.78
Christchurch -43.53 172.64
Hamilton -37.79 175.28
@FJ
Suva -18.14 178.44
@PG
Port Moresby -9.44 147.18
@NC
Noumea -22.28 166.46
@PF
Papeete -17.54 -149.57
@WS
Apia -13.83 -171.76
@TO
Nukualofa -21.14 -175.20
`;

export const REGION_DATA = `
@IN
Andhra Pradesh 15.91 79.74
Arunachal Pradesh 28.22 94.73
Assam 26.20 92.94
Bihar 25.10 85.31
Chhattisgarh 21.28 81.87
Goa 15.30 74.12
Gujarat 22.26 71.19
Haryana 29.06 76.09
Himachal Pradesh 31.10 77.17
Jharkhand 23.61 85.28
Karnataka 15.32 75.71
Kerala 10.85 76.27
Madhya Pradesh 22.97 78.66
Maharashtra 19.75 75.71
Manipur 24.66 93.91
Meghalaya 25.47 91.37
Mizoram 23.16 92.94
Nagaland 26.16 94.56
Odisha/Orissa 20.95 85.10
Punjab 31.15 75.34
Rajasthan 27.02 74.22
Sikkim 27.53 88.51
Tamil Nadu 11.13 78.66
Telangana 18.11 79.02
Tripura 23.94 91.99
Uttar Pradesh 26.85 80.91
Uttarakhand/Uttaranchal 30.07 79.02
West Bengal 22.99 87.86
National Capital Territory of Delhi/NCT 28.70 77.10
Jammu and Kashmir 33.78 76.58
Ladakh 34.15 77.58
Chandigarh 30.73 76.78
Puducherry 11.94 79.81
Andaman and Nicobar Islands 11.74 92.66
Lakshadweep 10.57 72.64
Dadra and Nagar Haveli and Daman and Diu 20.40 72.83
@PK
Punjab 31.15 72.71
Sindh 25.89 68.53
Khyber Pakhtunkhwa 34.95 72.33
Balochistan 28.49 65.10
Islamabad Capital Territory 33.68 73.05
@US
Alabama 32.81 -86.79
Alaska 64.07 -152.28
Arizona 34.29 -111.66
Arkansas 34.90 -92.44
California 37.18 -119.47
Colorado 39.00 -105.55
Connecticut 41.62 -72.73
Delaware 38.99 -75.51
District of Columbia 38.91 -77.01
Florida 28.63 -82.45
Georgia 32.64 -83.44
Hawaii 20.29 -156.37
Idaho 44.35 -114.61
Illinois 40.04 -89.20
Indiana 39.89 -86.28
Iowa 42.07 -93.50
Kansas 38.49 -98.38
Kentucky 37.53 -85.30
Louisiana 31.07 -91.99
Maine 45.37 -69.24
Maryland 39.05 -76.79
Massachusetts 42.26 -71.81
Michigan 44.35 -85.41
Minnesota 46.28 -94.31
Mississippi 32.74 -89.67
Missouri 38.36 -92.46
Montana 47.05 -109.63
Nebraska 41.54 -99.80
Nevada 39.33 -116.63
New Hampshire 43.68 -71.58
New Jersey 40.19 -74.67
New Mexico 34.41 -106.11
New York 42.95 -75.53
North Carolina 35.56 -79.39
North Dakota 47.45 -100.47
Ohio 40.29 -82.79
Oklahoma 35.59 -97.49
Oregon 43.93 -120.56
Pennsylvania 40.88 -77.80
Rhode Island 41.68 -71.51
South Carolina 33.91 -80.90
South Dakota 44.44 -100.23
Tennessee 35.86 -86.35
Texas 31.48 -99.33
Utah 39.31 -111.67
Vermont 44.07 -72.67
Virginia 37.52 -78.85
Washington 47.38 -120.45
West Virginia 38.64 -80.62
Wisconsin 44.62 -89.99
Wyoming 43.00 -107.55
@CA
Ontario 51.25 -85.32
Quebec 52.94 -73.55
British Columbia 53.73 -127.65
Alberta 55.00 -115.00
Manitoba 53.76 -98.81
Saskatchewan 54.00 -106.00
Nova Scotia 45.00 -63.00
New Brunswick 46.50 -66.16
Newfoundland and Labrador 53.14 -57.66
Prince Edward Island 46.51 -63.42
Yukon 64.28 -135.00
Northwest Territories 64.83 -124.85
Nunavut 70.30 -90.00
@GB
England 52.36 -1.17
Scotland 56.49 -4.20
Wales 52.13 -3.78
Northern Ireland 54.79 -6.49
@AU
New South Wales -32.16 147.02
Victoria -36.85 144.28
Queensland -20.92 142.70
Western Australia -25.04 122.30
South Australia -30.00 135.76
Tasmania -42.00 146.63
Northern Territory -19.49 132.55
Australian Capital Territory -35.47 149.01
@DE
Baden-Wurttemberg/Baden Wurttemberg 48.66 9.35
Bavaria/Bayern 48.79 11.50
Berlin 52.52 13.40
Brandenburg 52.41 12.53
Bremen 53.08 8.81
Hamburg 53.55 9.99
Hesse/Hessen 50.65 9.16
Lower Saxony/Niedersachsen 52.64 9.85
Mecklenburg-Vorpommern/Mecklenburg-Western Pomerania 53.61 12.43
North Rhine-Westphalia/Nordrhein-Westfalen 51.43 7.66
Rhineland-Palatinate/Rheinland-Pfalz 50.12 7.31
Saarland 49.40 7.02
Saxony/Sachsen 51.10 13.20
Saxony-Anhalt/Sachsen-Anhalt 51.95 11.69
Schleswig-Holstein 54.22 9.70
Thuringia/Thueringen/Thuringen 50.90 11.03
@AE
Dubai 25.20 55.27
Abu Dhabi 24.45 54.38
Sharjah 25.35 55.40
Ajman 25.41 55.44
Ras al Khaimah 25.79 55.94
Fujairah 25.12 56.33
Umm al Quwain 25.52 55.55
@CN
Guangdong 23.38 113.50
Zhejiang 29.18 120.09
Jiangsu 32.97 119.46
Sichuan 30.65 102.70
Shandong 36.34 118.15
Henan 33.88 113.61
Hubei 30.98 112.27
Hunan 27.62 111.71
Fujian 26.08 117.99
Yunnan 24.97 101.49
Beijing 39.90 116.41
Shanghai 31.23 121.47
@BD
Dhaka 23.81 90.41
Chattogram/Chittagong 22.36 91.78
Khulna 22.85 89.54
Sylhet 24.90 91.87
Rajshahi 24.37 88.60
@NP
Bagmati 27.70 85.40
@SG
Singapore 1.35 103.82
@HK
Hong Kong 22.32 114.17
`;
