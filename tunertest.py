import socket
import struct

def pad4(data):
    return data + (b"\0" * ((4 - (len(data) % 4)) % 4))

def osc_string(s):
    return pad4(s.encode() + b"\0")

packet = b"".join([
    osc_string("/rfx/tuner"),
    osc_string(",siffi"),
    osc_string("B"),
    struct.pack(">i", 3),
    struct.pack(">f", 2.5),
    struct.pack(">f", 0.95),
    struct.pack(">i", 1),
])

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.sendto(packet, ("127.0.0.1", 55000))

print("Sent.")