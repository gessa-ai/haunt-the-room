import numpy as np, wave
sr=48000; D=4.0; n=int(sr*D); t=np.arange(n)/sr; out=np.zeros(n)
rng=np.random.default_rng(7)
def place(sig,at):
    i=int(at*sr); m=min(len(sig),n-i); out[i:i+m]+=sig[:m]
def lp(x,a):  # one-pole lowpass
    y=np.empty_like(x); s=0.
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
# whoosh riser 0-0.4
tw=np.arange(int(.4*sr))/sr; w=rng.uniform(-1,1,len(tw))*(tw/.4)**3
w=w-lp(w,0.15); place(0.5*w,0)
# brass hit at 0.4: detuned saws Bb minor-ish stack, filter sweep
th=np.arange(int(1.55*sr))/sr; env=np.exp(-th*2.0)*np.minimum(1,th*300)
saw=lambda f:2*((f*th)%1)-1
chord=sum(saw(f)+saw(f*1.006) for f in [116.5,138.6,174.6,233.1,277.2])/10
br=lp(chord*env,0.12)*1.4
sub=np.sin(2*np.pi*np.cumsum(45+70*np.exp(-th*18))/sr)*np.exp(-th*4)
place(br+0.9*sub,0.4)
# static burst at 0.4, bitcrushed
ts=np.arange(int(.45*sr))/sr; st=rng.uniform(-1,1,len(ts))*np.exp(-ts*8); st=np.round(st*8)/8; st=st-lp(st,0.3)
place(0.6*st,0.4)
# hard cut: silence the hit before swell
cut=int(1.9*sr); out[cut:]=0
# eerie swell 1.9-4.0
te=np.arange(n-cut)/sr; a=np.minimum(1,te/1.5)*np.minimum(1,(2.1-te)/0.35).clip(0)
v=1+0.005*np.sin(2*np.pi*5*te)
ph=lambda f,vv: np.sin(2*np.pi*np.cumsum(f*vv)/sr)
sw=0.5*ph(55,1)+0.4*ph(82.4,v)+0.35*ph(116.5,v)+0.25*ph(233.1,1+0.008*np.sin(2*np.pi*.7*te))+0.2*ph(349.2,v)+0.12*ph(698.4,v)
sw+=0.06*lp(rng.uniform(-1,1,len(te)),0.05)
out[cut:]+=0.35*a*sw
# reverb-ish echoes
for d,g in [(0.07,0.3),(0.19,0.22),(0.37,0.15)]:
    k=int(d*sr); e=np.zeros(n); e[k:]=out[:-k]*g; out+=e
out[int(1.9*sr):int(1.9*sr)+1]  # noop
out=np.tanh(out*1.2)
st2=np.stack([out,np.roll(out,40)],1)
st2=(st2/np.abs(st2).max()*0.95*32767).astype(np.int16)
with wave.open('mix_raw.wav','wb') as f: f.setnchannels(2); f.setsampwidth(2); f.setframerate(sr); f.writeframes(st2.tobytes())
