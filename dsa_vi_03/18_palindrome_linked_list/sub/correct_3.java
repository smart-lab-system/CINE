

/* Structure of class Node is
class Node
{
    int data;
    Node next;

    Node(int d)
    {
        data = d;
        next = null;
    }
}*/

class Solution {
    static Node reverseList(Node head){
        Node curr=head, prev=null, next;
        while(curr!=null){
            next=curr.next;
            curr.next=prev;
            prev=curr;
            curr=next;
        }
        return prev;
    }
    
    static boolean isMatch(Node n1, Node n2){
        while(n1!=null && n2!=null){
            if(n1.data!=n2.data){
                return false;
            }
            n1=n1.next;
            n2=n2.next;
        }
        return true;
    }
    // Function to check whether the list is palindrome.
    static boolean isPalindrome(Node head) {
        // Your code here
        if(head==null && head.next==null){
            return true;
        }
        
        Node slow=head, fast=head;
        
        while(fast.next!=null && fast.next.next!=null){
            slow=slow.next;
            fast=fast.next.next;
        }
        
        Node head2=reverseList(slow.next);
        slow.next=null;
        
        boolean ret=isMatch(head,head2);
        
        head2=reverseList(head2);
        slow.next=head2;
        
        return ret;
    }
}