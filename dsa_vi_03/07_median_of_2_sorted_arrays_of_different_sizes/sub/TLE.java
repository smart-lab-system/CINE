

// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
        ArrayList<Integer> list=new ArrayList<>();
        int pos;
        int i=0,j=0;
        while(i<a.length||j<b.length){
            if(i<a.length){
               pos=Collections.binarySearch(list,a[i]);
                if (pos < 0) pos = -pos - 1;
               list.add(pos,a[i]);
               i++;
            }
            else if(i<b.length){
               pos=Collections.binarySearch(list,b[j]);
                if (pos < 0) pos = -pos - 1;
               list.add(pos,b[j]);
               j++;
            }
        }
        double m;
        pos=a.length+b.length;
        if(pos%2!=0) m=(double)list.get((pos/2));
        else{
            m=(double)(list.get(pos/2)+list.get((pos/2)+1))/2;
        }
        return m;
    }
}